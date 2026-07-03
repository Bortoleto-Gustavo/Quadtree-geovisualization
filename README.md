# Mapa Geoestatístico com QuadTree

Sistema de visualização de dados geográficos utilizando estrutura de dados QuadTree para indexação espacial eficiente.

## Pré-requisitos

- Python 3.8 ou superior
- Pip (gerenciador de pacotes Python)
- Navegador web (Chrome, Firefox, Edge, etc.)

## Formato de CSV necessário
 |latitude|longitude|empresa|nome|Municipio|estado|dados|
 |--|--|--|--|--|--|--|
 |-23.5505|-46.6333|TechSolutions|Matriz SP|São Paulo|SP|1500

 Somente os dados de latitude e longitude são obrigatórios, sendo utilizados pela quadtree para plotagem dos pontos no mapa. As outras informações aparecem no meno pop-up de cada ponto ao posicionr o mouse sobre tal.

## Estrutura do projeto
```
quadtree-map/
├── app.py               # Servidor Flask e API
├── quadtree.py          # Implementação da QuadTree
├── frontend/            # Interface do usuário
│   ├── index.html       # Página principal
│   ├── script.js        # Lógica do mapa e interações
│   └── style.css        # Estilos da aplicação
└── README.md            
```

## Ferramentas utilizadas
- Backend: Flask (Python)
- Estrutura de Dados: QuadTree
- Mapa: Leaflet.js
- Processamento: Pandas
- Comunicação: REST API

## Instalação

### 1. Clone o repositório
```bash
git clone https://github.com/Bortoleto-Gustavo/quadtree-map.git
cd quadtree-map
```
### 2. Instale as dependências
```
pip install flask flask-cors pandas
```

## Execução
### 1. Inicie o servidor Flask
```
python app.py
```
### 2. Em seu navegador acesse:
```
http://localhost:5000
```
### 3. Upload arquivo CSV
- Clique em "Selecione um arquivo CSV"
- Escolha seu arquivo .csv
- Aguarde o processamento
### 4. Visualização dos dados
- Selecione uma das três visualizações possíveis
   - Pontos
      - Os pontos aparecerão automaticamente no mapa de acordo com as coordenadas de latitude e longitude 
   - Símbolos proporcionais
      - Dado o nome do município, um círculo será desenhado em seu centro cujo raio é proporcional à quantidade de registros associados à mesma cidade 
   - Coroplético
      - Dado o nome do município, seu território vai ser pintado com um gradiente de cores proporcionais à quantidade de registros associados à mesma cidade
- Clique em um ponto ou no círculo para ver todas as informações do arquivo .csv enviado
### 5. Navegar no mapa
- Zoom: Use a roda do mouse ou os botões + e -
- Mover: Clique e arraste o mapa
- A QuadTree atualiza os pontos / símbolos conforme você navega
