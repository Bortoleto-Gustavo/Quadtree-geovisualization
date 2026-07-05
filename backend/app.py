from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pandas as pd
import os
import unicodedata
import json

from quadtree import Point, Rectangle, QuadTree

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))

app = Flask(__name__, static_folder='frontend', static_url_path='')
CORS(app)

# Armazenamento global
dataset = None
world_boundary = Rectangle(x=0, y=0, w=180, h=90)
quadtree = QuadTree(world_boundary)
geojson_cache = {}

def rebuild_quadtree(df):
    global quadtree
    quadtree = QuadTree(world_boundary)

    # detecta automaticamente o nome da coluna da cidade/município
    col_municipio = next((c for c in df.columns if c.lower() in ['municipio', 'município', 'cidade']), None)

    if col_municipio:
        # sanitização dos nomes dos municípios
        df['municipio_limpo'] = (
            df[col_municipio]
            .astype(str)
            .str.normalize('NFKD')
            .str.encode('ascii', errors='ignore')
            .str.decode('utf-8')
            .str.lower()
            .str.strip()
        )
    else:
        df['municipio_limpo'] = 'desconhecido'

    for _, row in df.iterrows():
        point = Point(
            lat=float(row["latitude"]),
            lon=float(row["longitude"]),
            data=row.to_dict()
        )
        quadtree.insert(point)

def calculate_radius(value, min_value, max_value):
    min_radius = 5
    max_radius = 30
    if max_value == min_value:
        return min_radius
    normalized = (value - min_value) / (max_value - min_value)
    return min_radius + normalized * (max_radius - min_radius)

def limpar_texto(texto):
    if pd.isna(texto) or texto is None:
        return ""
    texto = str(texto)
    return (
        unicodedata.normalize('NFKD', texto)
        .encode('ascii', errors='ignore')
        .decode('utf-8')
        .lower()
        .strip()
    )

# Rota principal
@app.route('/')
def serve_index():
    return send_from_directory(frontend_dir, 'index.html')

# Rotas para arquivos estáticos
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(frontend_dir, path)

# Upload CSV
@app.route("/upload", methods=["POST"])
def upload():
    global dataset
    if "file" not in request.files:
        return {"success": False, "error": "Nenhum arquivo enviado"}, 400
    file = request.files["file"]
    try:
        df = pd.read_csv(file)
        required_columns = ["latitude", "longitude"]
        for col in required_columns:
            if col not in df.columns:
                return {
                    "success": False,
                    "error": f"Coluna obrigatória ausente: {col}"
                }, 400
        dataset = df
        rebuild_quadtree(df)
        return {"success": True, "rows": len(df)}
    except Exception as e:
        return {"success": False, "error": str(e)}, 500

# Pontos
@app.route("/points")
def get_points():
    try:
        north = float(request.args["north"])
        south = float(request.args["south"])
        east = float(request.args["east"])
        west = float(request.args["west"])
        area = Rectangle(
            x=(east + west) / 2,
            y=(north + south) / 2,
            w=(east - west) / 2,
            h=(north - south) / 2
        )
        points = quadtree.query(area)
        return jsonify([p.data for p in points])
    except Exception as e:
        return {"error": str(e)}, 500

# Símbolos proporcionais
@app.route("/proportional")
def proportional_symbols():
    if dataset is None:
        return {"error": "Nenhum dataset carregado"}, 400
    
    try:
        north = float(request.args["north"])
        south = float(request.args["south"])
        east = float(request.args["east"])
        west = float(request.args["west"])

        area = Rectangle(
            x=(east + west) / 2,
            y=(north + south) / 2,
            w=(east - west) / 2,
            h=(north - south) / 2
        )

        # coleta os registros brutos dentro da tela atual usando a quadtree
        points = quadtree.query(area)

        # retorna uma lista vazia se não houver nenhum ponto
        if not points:
            return jsonify([])

        # extrai os dados puros armazenados dentro de cada ponto encontrado 
        # e os agrupa em uma lista
        records = [p.data for p in points]

        # transforma essa lista de dados brutos em um dataframe do Pandas, 
        # facilitando manipulações ou análises matemáticas posteriores.
        df_area = pd.DataFrame(records)

        # encontra o nome real da coluna para colocar no popup
        col_original = next((c for c in df_area.columns if c.lower() in ['municipio', 'município', 'cidade']), 'municipio_limpo')

        metric = request.args.get("metric", "count")

        # se for por valor, tenta achar a coluna numérica
        val_col = next((c for c in df_area.columns if c.lower() in ['valor', 'value', 'dados'] and pd.api.types.is_numeric_dtype(df_area[c])), None)

        # verificar qual a métrica
        if metric == "value" and val_col:
            # agrupa SOMANDO os valores da coluna numérica
            grouped = df_area.groupby('municipio_limpo').agg(
                total=(val_col, 'sum'),                # soma os valores dos dados
                latitude=('latitude', 'mean'),         # tira a média para achar o centro do círculo
                longitude=('longitude', 'mean'),       # mesma coisa
                nome_exibicao=(col_original, 'first')  # pega o nome original para o popup
            ).reset_index()
        else:
            # agrupa pela coluna limpa e faz os cálculos agregados
            grouped = df_area.groupby('municipio_limpo').agg(
                total=('municipio_limpo', 'count'),    # conta quantas empresas existem na cidade
                latitude=('latitude', 'mean'),
                longitude=('longitude', 'mean'),
                nome_exibicao=(col_original, 'first')
            ).reset_index()

        # encontra o mínimo e o máximo de contagens na tela para calibrar os tamanhos dos raios
        min_value = grouped['total'].min()
        max_value = grouped['total'].max()

        result = []

        for _, row in grouped.iterrows():
            qtd_empresas = int(row['total'])

            raio = calculate_radius(qtd_empresas, min_value, max_value)

            result.append({
                "latitude": float(row['latitude']),
                "longitude": float(row['longitude']),
                "total": qtd_empresas,
                "radius": raio,
                "Municipio": row['nome_exibicao']
            })
        return jsonify(result)
    
    except Exception as e:
        return {"error": str(e)}, 500

# Coroplético
@app.route("/choropleth")
def choropleth():
    if dataset is None:
        return {"error": "Nenhum dataset carregado"}, 400
    try:
        col_estado = next((c for c in dataset.columns if c.lower() in ['estado', 'uf']), None)

        if not col_estado:
            return {"error": "O arquivo csv precisa de uma coluna de Estado (UF) para carregar os mapas corretos."}, 400

        metric = request.args.get("metric", "count")

        val_col = next((c for c in dataset.columns if c.lower() in ['valor', 'value', 'dados'] and pd.api.types.is_numeric_dtype(dataset[c])), None)

        # USAR A QUADTREE PARA FILTRAR A TELA
        north = float(request.args["north"])
        south = float(request.args["south"])
        east = float(request.args["east"])
        west = float(request.args["west"])

        area = Rectangle(
            x=(east + west) / 2,
            y=(north + south) / 2,
            w=(east - west) / 2,
            h=(north - south) / 2
        )

        # só pega os registros que estão dentro da tela AGORA
        points = quadtree.query(area)

        if not points:
            return jsonify({"type": "FeatureCollection", "features": []})

        # converte os pontos visíveis de volta para Pandas
        records = [p.data for p in points]
        df_area = pd.DataFrame(records)

        # agrupa só os dados que estão visiveis na tela
        if metric == "value" and val_col:
            # agrupa SOMANDO os valores
            grouped = df_area.groupby(['municipio_limpo', col_estado])[val_col].sum().reset_index(name='total')
        else:
            # agrupa os dados para pegar o total por município e descobrir os estados presentes
            grouped = df_area.groupby(['municipio_limpo', col_estado]).size().reset_index(name='total')
        
        # converte o pandas em um dicionário python para complexidade O(1)
        mapa_totais = {}
        for _, row in grouped.iterrows():
            mun = str(row['municipio_limpo'])
            uf = str(row[col_estado]).upper().strip()
            mapa_totais[(mun, uf)] = float(row['total'])
            
            # A chave do dicionário será uma tupla: ("sao paulo", "SP")
            mapa_totais[(mun, uf)] = float(row['total'])

        estados_presentes = grouped[col_estado].astype(str).str.upper().str.strip().unique()

        features_combinadas= []

        # lê apenas os arquivos geojson dos estados que estão presentes no csv
        for uf in estados_presentes:
            # Se o estado ainda não está na memória RAM, a gente lê do disco e guarda
            if uf not in geojson_cache:
                caminho_geojson = os.path.join(os.path.dirname(__file__), 'geojson', f'{uf}.json')
                
                if os.path.exists(caminho_geojson):
                    with open(caminho_geojson, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        
                        # limpa os nomes das cidades do geojson apenas 1 vez
                        for feature in data.get('features', []):
                            nome_cru = feature['properties'].get('NOME', '')
                            feature['properties']['nome_limpo'] = limpar_texto(nome_cru)
                            
                        geojson_cache[uf] = data
                else:
                    print(f"Aviso: Arquivo de limites não encontrado para o estado {uf}")
                    continue # Pula para o próximo estado

            # Pega o arquivo instantaneamente da memória RAM
            geo_data = geojson_cache[uf]

            for feature in geo_data.get('features', []):
                nome_geo = feature['properties'].get('NOME', '')
                nome_geo_limpo = limpar_texto(nome_geo)

                # Busca instantânea
                total = mapa_totais.get((nome_geo_limpo, uf))

                # Otimização para salvar memória: não envia se estiver vazio
                if total is None:
                    continue

                # MUITO IMPORTANTE: Fazemos uma cópia leve (shallow copy) das propriedades.
                # Se não fizermos isso, como o geo_data está em cache global, 
                # a gente sujaria o arquivo na memória com os dados do usuário atual!
                feature_copy = {
                    "type": feature.get("type", "Feature"),
                    "geometry": feature.get("geometry"),
                    "properties": feature['properties'].copy()
                }

                # Injeta o total na cópia
                feature_copy['properties']['total'] = total
                features_combinadas.append(feature_copy)

        # Retorna o pacote no formato padrão de FeatureCollection que o Leaflet espera
        return jsonify({
            "type": "FeatureCollection",
            "features": features_combinadas
        })

    except Exception as e:
        return {"error": str(e)}, 500

# Dados estatísticas
@app.route("/statistics")
def statistics():
    if dataset is None:
        return {"error": "Nenhum dataset carregado"}, 400
    
    value_column = request.args.get("value", "valor")

    if value_column not in dataset.columns:
        return {
            "error": f"A coluna '{value_column}' solicitada não existe neste CSV."
        }, 400
    
    if not pd.api.types.is_numeric_dtype(dataset[value_column]):
        return {
            "error": f"A coluna '{value_column}' não contém valores numéricos válidos para estatística."
        }, 400
    
    try:
        return {
            "rows": len(dataset),
            "min": float(dataset[value_column].min()),
            "max": float(dataset[value_column].max()),
            "mean": float(dataset[value_column].mean()),
            "median": float(dataset[value_column].median())
        }
    except Exception as e:
        return {"error": f"Erro ao calcular estatísticas: {str(e)}"}, 500

# Info dataset
@app.route("/dataset")
def dataset_info():
    if dataset is None:
        return {"loaded": False}
    return {
        "loaded": True,
        "rows": len(dataset),
        "columns": list(dataset.columns)
    }

# Reset
@app.route("/reset", methods=["POST"])
def reset():
    global dataset, quadtree
    dataset = None
    quadtree = QuadTree(world_boundary)
    return {"success": True}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)