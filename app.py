from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pandas as pd

from quadtree import Point, Rectangle, QuadTree

app = Flask(__name__, static_folder='frontend', static_url_path='')
CORS(app)

# Armazenamento global
dataset = None
world_boundary = Rectangle(x=0, y=0, w=180, h=90)
quadtree = QuadTree(world_boundary)

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

# Rota principal
@app.route('/')
def serve_index():
    return send_from_directory('frontend', 'index.html')

# Rotas para arquivos estáticos
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('frontend', path)

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

        # agrupa pela coluna limpa e faz os cálculos agregados
        grouped = df_area.groupby('municipio_limpo').agg(
            total=('municipio_limpo', 'count'),    # conta quantas empresas existem na cidade
            latitude=('latitude', 'mean'),         # tira a média para achar o centro do círculo
            longitude=('longitude', 'mean'),       # mesma coisa
            nome_exibicao=(col_original, 'first')  # pega o nome original para o popup
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
        group_by = request.args.get("group", "municipio")
        value_column = request.args.get("value", "valor")
        grouped = dataset.groupby(group_by)[value_column].mean().reset_index()
        return jsonify(grouped.to_dict(orient="records"))
    except Exception as e:
        return {"error": str(e)}, 500

# Dados estatísticas
@app.route("/statistics")
def statistics():
    if dataset is None:
        return {"error": "Nenhum dataset carregado"}, 400
    value_column = request.args.get("value", "valor")
    return {
        "rows": len(dataset),
        "min": float(dataset[value_column].min()),
        "max": float(dataset[value_column].max()),
        "mean": float(dataset[value_column].mean()),
        "median": float(dataset[value_column].median())
    }

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