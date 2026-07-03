console.log('Inicializando sistema...');

// Config do mapa
const map = L.map('map').setView([-15.4, -55], 4);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

console.log('Mapa inicializado');

//var globais
let arquivoSelecionado = null;
let layerGroup = L.layerGroup().addTo(map);
let dadosCarregados = false;
let todosOsPontos = [];
let todosOsDados = [];

//DOM
const inputCSV = document.getElementById("csv");
const statusDiv = document.getElementById("status");
const estatisticasDiv = document.getElementById("estatisticas");
const contagemPontos = document.getElementById("contagem-pontos");

console.log('Elementos DOM carregados');

// event Listeners
inputCSV.addEventListener("change", (event) => {
    arquivoSelecionado = event.target.files[0];
    console.log('Arquivo selecionado:', arquivoSelecionado.name);
    if (arquivoSelecionado) {
        statusDiv.innerHTML = `<p>Arquivo selecionado: ${arquivoSelecionado.name}</p>`;
        uploadCSV(arquivoSelecionado);
    }
});

//upload do CSV
async function uploadCSV(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        console.log('Enviando arquivo para o servidor...');
        statusDiv.innerHTML = `<p>Processando arquivo...</p>`;
        
        const response = await fetch('http://localhost:5000/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        console.log('Resposta do servidor:', data);

        if (data.success) {
            dadosCarregados = true;
            statusDiv.innerHTML = `
                <p>Arquivo carregado com sucesso!</p>
                <p>Total de registros: ${data.rows}</p>
            `;
            
            console.log('Carregando informações do dataset...');
            await carregarDatasetInfo();
            
            console.log('Carregando todos os pontos...');
            await carregarTodosPontos();
            
            console.log('Carregando estatísticas...');
            await carregarEstatisticas();
            
        } else {
            console.error('Erro no upload:', data.error);
            statusDiv.innerHTML = `<p>Erro: ${data.error}</p>`;
        }
    } catch (error) {
        console.error('Erro de conexão:', error);
        statusDiv.innerHTML = `<p>Erro de conexão: ${error.message}</p>`;
    }
}

// load info do dataset
async function carregarDatasetInfo() {
    try {
        const response = await fetch('http://localhost:5000/dataset');
        const data = await response.json();
        console.log('Informações do dataset:', data);
        
        if (data.loaded) {
            console.log('Dataset carregado com colunas:', data.columns);
        }
    } catch (error) {
        console.error('Erro ao carregar informações:', error);
    }
}

// carregar os pontos
async function carregarTodosPontos() {
    try {
        // Área que cobre todo o Brasil
        const params = {
            north: 10,
            south: -35,
            east: -25,
            west: -75
        };
        
        const queryString = new URLSearchParams(params).toString();
        console.log('Buscando pontos com parâmetros:', params);
        
        const tipoVisualizacao = document.getElementById("visualizacao").value;

        // muda a rota do endpoint -> vai ter que mudar essa linha quando adicionar o cloroplético
        const rotaEndpoint = tipoVisualizacao === "Símbolos Proporcionais" ? "proportional" : "points";

        const response = await fetch(`http://localhost:5000/${rotaEndpoint}?${queryString}`);

        const data = await response.json();
        
        console.log(`Recebidos ${data.length} pontos do servidor`);
        
        if (data.error) {
            console.error('Erro da API:', data.error);
            return;
        }
        
        // Verificar se os dados têm latitude e longitude
        if (data.length > 0) {
            console.log('Amostra do primeiro ponto:', data[0]);
            console.log('Colunas disponíveis:', Object.keys(data[0]));
        }
        
        todosOsDados = data;
        
        // garente formatação esperada
        todosOsPontos = data.map(item => {
            // Extrair latitude e longitude
            const lat = item.latitude || item.Latitude || item.lat || item.Lat || 0;
            const lon = item.longitude || item.Longitude || item.lon || item.Lon || 0;
            
            return {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                data: item
            };
        });
        
        console.log(`${todosOsPontos.length} pontos processados para plotagem`);
        
        plotarPontos();
        
        // Atualiza contagem
        if (contagemPontos) {
            contagemPontos.textContent = `${todosOsPontos.length} pontos`;
        }
        
        // Centraliza mapa
        if (todosOsPontos.length > 0) {
            centralizarMapa();
        }
        
    } catch (error) {
        console.error('Erro ao carregar pontos:', error);
        statusDiv.innerHTML = `<p>Erro ao carregar pontos: ${error.message}</p>`;
    }
}

// Carrega estatísticas
async function carregarEstatisticas() {
    try {
        // Tentar a coluna dos dados
        let valueColumn = 'dados';
        
        if (todosOsDados.length > 0) {
            const colunas = Object.keys(todosOsDados[0]);
            console.log('Colunas disponíveis para estatísticas:', colunas);

            const colunasNumericas = ['dados', 'valor', 'value'];
            for (const col of colunasNumericas) {
                if (colunas.includes(col)) {
                    valueColumn = col;
                    break;
                }
            }
            
            // Se não encontrou usa a primeira coluna numérica
            if (!colunasNumericas.includes(valueColumn)) {
                for (const col of colunas) {
                    if (col !== 'latitude' && col !== 'longitude' && 
                        col !== 'Municipio' && col !== 'estado' &&
                        col !== 'cidade' && col !== 'uf' &&
                        !isNaN(parseFloat(todosOsDados[0][col]))) {
                        valueColumn = col;
                        break;
                    }
                }
            }
        }
        
        console.log('Usando coluna para estatísticas:', valueColumn);
        
        const response = await fetch(`http://localhost:5000/statistics?value=${valueColumn}`);
        const data = await response.json();
        
        if (data.error) {
            estatisticasDiv.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        
        console.log('Estatísticas recebidas:', data);
        
        estatisticasDiv.innerHTML = `
            <p>Total de registros: ${data.rows}</p>
            <p>Mínimo: ${data.min.toFixed(2)}</p>
            <p>Máximo: ${data.max.toFixed(2)}</p>
            <p>Média: ${data.mean.toFixed(2)}</p>
            <p>Mediana: ${data.median.toFixed(2)}</p>
            <p style="font-size: 11px; color: #888; margin-top: 5px;">
                Coluna: ${valueColumn}
            </p>
        `;
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

// plota os pontos
function plotarPontos() {
    console.log('Plotando pontos no mapa...');
    
    // apaga camada anterior
    layerGroup.clearLayers();
    
    if (!todosOsPontos || todosOsPontos.length === 0) {
        console.warn('Nenhum ponto para plotar');
        return;
    }
    
    // Cores para os pontos
    const cores = ['#ff1900b4'];
    
    let pontosPlotados = 0;

    // verifica qual a visualização selecionada no menu
    const visualizacaoSelect = document.getElementById("visualizacao");
    const tipoVisualizacao = visualizacaoSelect ? visualizacaoSelect.value : "Pontos";
    
    todosOsPontos.forEach((ponto, index) => {
        // Valida as coordenadas
        if (isNaN(ponto.lat) || isNaN(ponto.lon)) {
            console.warn(`Ponto ${index} com coordenadas inválidas:`, ponto);
            return;
        }
        
        // Verificar se está dentro do Brasil
        if (ponto.lat < -35 || ponto.lat > 10 || ponto.lon < -75 || ponto.lon > -25) {
            console.warn(`Ponto ${index} fora do Brasil:`, ponto);
        }
        
        const cor = cores[index % cores.length];
        
        // define se usa raio 7 ou o raio que veio do backend
        const raio = (tipoVisualizacao === "Símbolos Proporcionais" && ponto.data.radius)
            ? ponto.data.radius
            : 7;

        const marker = L.circleMarker([ponto.lat, ponto.lon], {
            radius: raio,
            fillColor: cor,
            color: '#af0000',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.7
        });
        
        // conteúdo do popup
        const dados = ponto.data || {};
        let popupContent = `
            <div style="min-width: 180px; max-width: 300px;">
                <strong style="color: #00070e; font-size: 15px;">${dados.empresa || dados.nome || dados.Municipio || 'Ponto'}</strong>
                <hr style="margin: 8px 0; border: none; border-top: 1px solid #eee;">
        `;
        
        // exibe o total de registros se estiver agrupado (para simbolos proporcionais)
        if (dados.total) {
            popupContent += `
                <div style="margin: 5px 0; color: #af0000; font-weight: bold; font-size: 13px;">
                    Quantidade: ${dados.total} registros
                </div>
            `;
        }

        popupContent += `<hr style="margin: 8px 0; border: none; border-top: 1px solid #eee;">`;

        // Adiciona os campos principais primeiro
        const camposPrincipais = ['empresa', 'nome', 'Municipio', 'cidade', 'estado', 'uf', 'dados', 'valor', 'populacao'];
        const outrosCampos = [];
        
        for (const [key, value] of Object.entries(dados)) {
            if (value !== null && value !== undefined && value !== '') {
                // pular as coordenadas geradas pelo backend pra não poluir o popup
                if (key === 'radius' || key === 'total')
                    continue;
                
                if (camposPrincipais.includes(key)) {
                    popupContent += `
                        <div style="margin: 4px 0;">
                            <strong>${key}:</strong> 
                            <span style="color: #000000;">${value}</span>
                        </div>
                    `;
                } else if (key !== 'latitude' && key !== 'longitude' && 
                          key !== 'Latitude' && key !== 'Longitude') {
                    outrosCampos.push([key, value]);
                }
            }
        }
        
        // Adiciona os outros campos
        if (outrosCampos.length > 0) {
            popupContent += `<hr style="margin: 5px 0; border: none; border-top: 1px solid #eee;">`;
            for (const [key, value] of outrosCampos.slice(0, 5)) {
                popupContent += `
                    <div style="margin: 3px 0; font-size: 12px;">
                        <strong>${key}:</strong> 
                        <span style="color: #000000;">${value}</span>
                    </div>
                `;
            }
            if (outrosCampos.length > 5) {
                popupContent += `<div style="color: #030303; font-size: 11px;">+ ${outrosCampos.length - 5} outros campos</div>`;
            }
        }
        
        popupContent += `
                <hr style="margin: 5px 0; border: none; border-top: 1px solid #eee;">
                <div style="font-size: 11px; color: #999;">
                    Lat: ${ponto.lat.toFixed(6)} | Lon: ${ponto.lon.toFixed(6)}
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        marker.addTo(layerGroup);
        pontosPlotados++;
    });
    
    console.log(`${pontosPlotados} pontos plotados no mapa`);
}

// centralizar o mapa nos pontos
function centralizarMapa() {
    if (todosOsPontos.length === 0) return;
    
    console.log('Centralizando mapa...');
    
    // centro dos pontos
    let latSum = 0, lonSum = 0;
    let latMin = 90, latMax = -90, lonMin = 180, lonMax = -180;
    let pontosValidos = 0;
    
    todosOsPontos.forEach(p => {
        if (!isNaN(p.lat) && !isNaN(p.lon)) {
            latSum += p.lat;
            lonSum += p.lon;
            latMin = Math.min(latMin, p.lat);
            latMax = Math.max(latMax, p.lat);
            lonMin = Math.min(lonMin, p.lon);
            lonMax = Math.max(lonMax, p.lon);
            pontosValidos++;
        }
    });
    
    if (pontosValidos === 0) {
        console.warn('Nenhum ponto válido para centralizar');
        return;
    }
    
    const centerLat = latSum / pontosValidos;
    const centerLon = lonSum / pontosValidos;
    
    // zoom baseado na extensão dos pontos
    const latRange = latMax - latMin;
    const lonRange = lonMax - lonMin;
    const maxRange = Math.max(latRange, lonRange);
    
    let zoom = 10;
    if (maxRange > 20) zoom = 4;
    else if (maxRange > 10) zoom = 5;
    else if (maxRange > 5) zoom = 6;
    else if (maxRange > 2) zoom = 7;
    else if (maxRange > 1) zoom = 8;
    else if (maxRange > 0.5) zoom = 9;
    else zoom = 10;
    
    console.log(`Centralizando em [${centerLat}, ${centerLon}] com zoom ${zoom}`);
    map.setView([centerLat, centerLon], zoom);
}

// Busca os pontos na área visível
let timeoutId = null;
map.on('moveend', () => {
    if (dadosCarregados) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            const bounds = map.getBounds();
            console.log('Mapa movido, buscando pontos na área:', bounds);
            buscarPontosNaArea();
        }, 500);
    }
});

async function buscarPontosNaArea() {
    if (!dadosCarregados) return;
    
    const bounds = map.getBounds();
    const params = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
    };
    
    try {
        const queryString = new URLSearchParams(params).toString();
        
        // mesma lógica da função carregarTodosPontos()

        const tipoVisualizacao = document.getElementById("visualizacao").value;

        // muda a rota do endpoint -> vai ter que mudar essa linha quando adicionar o cloroplético
        const rotaEndpoint = tipoVisualizacao === "Símbolos Proporcionais" ? "proportional" : "points";

        const response = await fetch(`http://localhost:5000/${rotaEndpoint}?${queryString}`);


        const data = await response.json();
        
        if (data.error) {
            console.error('Erro na busca:', data.error);
            return;
        }
        
        console.log(`${data.length} pontos na área atual`);
        
        todosOsDados = data;
        todosOsPontos = data.map(item => ({
            lat: parseFloat(item.latitude || item.Latitude || item.lat || item.Lat || 0),
            lon: parseFloat(item.longitude || item.Longitude || item.lon || item.Lon || 0),
            data: item
        }));
        
        plotarPontos();
        
        if (contagemPontos) {
            contagemPontos.textContent = `${todosOsPontos.length} pontos (área atual)`;
        }
    } catch (error) {
        console.error('Erro ao buscar pontos:', error);
    }
}

console.log('Sistema inicializado com sucesso!');
console.log('Carregue um arquivo CSV para começar');

// atualiza o mapa automaticamente quando o usuário altera o tipo de visualização
const menuVisualizacao = document.getElementById("visualizacao");
if (menuVisualizacao) {
    menuVisualizacao.addEventListener("change", () => {
        if (dadosCarregados) {
            console.log("Mudou a visualização. Atualizando mapa...");
            buscarPontosNaArea();
        }
    });
}