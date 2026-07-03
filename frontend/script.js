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
let idRequisicaoAtual = 0;
let legendControl = null;

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

        let rotaEndpoint = "points";

        // muda a rota do endpoint de acordo com o tipo de visualização
        if (tipoVisualizacao === "Símbolos Proporcionais") 
            rotaEndpoint = "proportional";
        else if (tipoVisualizacao === "Coroplético") 
            rotaEndpoint = "choropleth";

        const response = await fetch(`http://localhost:5000/${rotaEndpoint}?${queryString}`);

        const data = await response.json();
        
        console.log(`Recebidos ${data.length} pontos do servidor`);
        
        if (data.error) {
            console.error('Erro da API:', data.error);
            return;
        }
        
        // se for coroplético, passa pro plotarCoropletico e para a função aqui
        if (tipoVisualizacao === "Coroplético") {
            plotarCoropletico(data);
            if (contagemPontos) {
                contagemPontos.textContent = `Modo Coroplético ativado`;
            }
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

// Carrega estatísticas com leitura direta do CSV Original
async function carregarEstatisticas() {
    const estatisticasDiv = document.getElementById("estatisticas");

    try {
        // pergunta pro servidor quais são as colunas reais do csv
        const infoResponse = await fetch('http://localhost:5000/dataset');
        const infoData = await infoResponse.json();

        if (!infoData.loaded) return;

        const colunasOriginais = infoData.columns;
        
        // tentar achar 'valor', 'value' ou 'dados'. Se não achar, usa a primeira que for numérica
        let valueColumn = 'valor'; 

        const colunasComuns = ['valor', 'value', 'dados'];
        let colunaEncontrada = false;

        for (const col of colunasComuns) {
            // procura ignorando maiúsculas/minúsculas
            const achou = colunasOriginais.find(c => c.toLowerCase() === col);
            if (achou) {
                valueColumn = achou;
                colunaEncontrada = true;
                break;
            }
        }

        // Se não achou colunas com nomes óbvios, pega a primeira coluna numérica (que não seja lat/lon)
        if (!colunaEncontrada && todosOsDados && todosOsDados.length > 0 && todosOsDados[0].data) {
             const amostra = todosOsDados[0].data;
             for (const col of colunasOriginais) {
                 const lower = col.toLowerCase();
                 if (!['latitude', 'longitude', 'lat', 'lon', 'municipio', 'cidade', 'estado', 'uf', 'municipio_limpo'].includes(lower)) {
                     if (!isNaN(parseFloat(amostra[col]))) {
                         valueColumn = col;
                         break;
                     }
                 }
             }
        }

        console.log('Solicitando estatísticas da coluna original:', valueColumn);
        
        // faz o pedido final para a rota de estatísticas
        const response = await fetch(`http://localhost:5000/statistics?value=${valueColumn}`);
        const data = await response.json();
        
        // se o python bloqueou (csv não tinha números)
        if (data.error) {
            estatisticasDiv.innerHTML = `
                <p style="color: #ff0000; font-weight: bold; font-size: 14px;">Atenção</p>
                <p style="font-size: 13px;">${data.error}</p>
            `;
            return;
        }
        
        // desenha as estatísticas reais na tela
        estatisticasDiv.innerHTML = `
            <p>Total de registros: ${data.rows}</p>
            <p>Mínimo: ${data.min.toFixed(2)}</p>
            <p>Máximo: ${data.max.toFixed(2)}</p>
            <p>Média: ${data.mean.toFixed(2)}</p>
            <p>Mediana: ${data.median.toFixed(2)}</p>
            <p style="font-size: 11px; color: #888; margin-top: 5px;">
                Coluna Base: <b>${valueColumn}</b>
            </p>
        `;
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        if (estatisticasDiv) {
            estatisticasDiv.innerHTML = `<p style="color: red;">Erro ao processar dados</p>`;
        }
    }
}

// plota os pontos
function plotarPontos() {
    console.log('Plotando pontos no mapa...');
    
    // apaga camada anterior
    layerGroup.clearLayers();

    // Remove a legenda se o usuário trocar para outra visualização
    if (legendControl) {
        map.removeControl(legendControl);
        legendControl = null;
    }
    
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

        // Adiciona os campos principais primeiro
        const camposPrincipais = ['empresa', 'nome', 'Municipio', 'cidade', 'estado', 'uf', 'dados', 'valor', 'populacao'];
        const outrosCampos = [];
        
        for (const [key, value] of Object.entries(dados)) {
            if (value !== null && value !== undefined && value !== '') {
                // pular informações geradas pelo backend não úteis ao usuário pra não poluir o popup
                if (key === 'radius' || key === 'total' || key === 'municipio_limpo')
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

// função que plota os polígonos dos municípios para a visualização coroplética
function plotarCoropletico(geojsonData) {
    console.log('Plotando mapa coroplético...');
    layerGroup.clearLayers();

    // descobre o valor máximo e mínimo para calcular o gradiente de cores
    const valores = geojsonData.features
        .map(f => f.properties.total)
        .filter(t => t > 0); // ignora cidades sem empresas

    const maxVal = Math.max(...valores);
    const minVal = Math.min(...valores);

    // função que define a cor baseada na quantidade
    function getColor(d) {
        // normaliza o valor entre 0 e 1
        let pct = (d - minVal) / (maxVal - minVal);
        
        // prevenção caso maxVal e minVal sejam iguais (ex: só tem 1 cidade no mapa)
        if (isNaN(pct)) pct = 1;

        // gradiente do amarelo (pouco) ao vermelho escuro (muito)
        return pct > 0.8 ? '#800026' :
            pct > 0.6 ? '#BD0026' :
            pct > 0.4 ? '#E31A1C' :
            pct > 0.2 ? '#FC4E2A' :
            pct > 0.0 ? '#FD8D3C' :
                        '#FFEDA0';
    }

    // Cria a camada GeoJSON no Leaflet
    L.geoJSON(geojsonData, {
        style: function (feature) {
            const qtd = feature.properties.total;
            return {
                fillColor: getColor(qtd),
                weight: 1,           // Espessura da borda do município
                opacity: 1,          // Opacidade da borda branca
                color: '#ffffff',    // Cor da borda
                fillOpacity: 0.8     // Opacidade padrão para todos, já que todos têm dados
            };
        },
        onEachFeature: function (feature, layer) {
            const props = feature.properties;
            layer.bindPopup(`
                <div style="min-width: 150px; text-align: center;">
                    <strong style="font-size: 14px;">${props.NOME} - ${props.UF}</strong>
                    <hr style="margin: 5px 0;">
                    Registros: <b>${props.total}</b>
                </div>
            `);
        }
    }).addTo(layerGroup);

    // remove a legenda antiga se existir
    if (legendControl) {
        map.removeControl(legendControl);
    }

    // só cria legenda se houver algum município com dados
    if (maxVal > 0) {
        legendControl = L.control({ position: 'bottomright' });

        legendControl.onAdd = function () {
            const div = L.DomUtil.create('div', 'info legend');
            
            // cria um gradiente em css para a barra de cores (as mesmas do mapa)
            const gradienteCores = "linear-gradient(to right, #FFEDA0, #FD8D3C, #FC4E2A, #E31A1C, #BD0026, #800026)";
            
            div.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 6px; text-align: center;">Total de Registros</div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold;">
                    <span>${minVal}</span>
                    <span>${maxVal}</span>
                </div>
                <div style="background: ${gradienteCores}; width: 180px; height: 12px; border-radius: 4px; border: 1px solid #aaa; margin-top: 4px;"></div>
            `;
            return div;
        };

        legendControl.addTo(map);
    }
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
    if (!dadosCarregados) {
        return;
    }
    
    const tipoVisualizacao = document.getElementById("visualizacao").value;
    
    // não precisamos travar o computador recarregando os polígonos a cada milímetro arrastado
    if (tipoVisualizacao === "Coroplético") {
        return;
    }

    clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            const bounds = map.getBounds();
            console.log('Mapa movido, buscando pontos na área:', bounds);
            buscarPontosNaArea();
        }, 500);
});

async function buscarPontosNaArea() {
    if (!dadosCarregados) 
        return;
    
    // cria uma "senha" única para esta requisição para evitar race conditions
    const idDestaRequisicao = ++idRequisicaoAtual;

    const bounds = map.getBounds();
    const params = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
    };

    // captura a tela de carregamento
    const loadingOverlay = document.getElementById("loading-overlay");

    try {
        const queryString = new URLSearchParams(params).toString();
        
        // mesma lógica da função carregarTodosPontos()

        const tipoVisualizacao = document.getElementById("visualizacao").value;

        let rotaEndpoint = "points";

        // muda a rota do endpoint de acordo com o tipo de visualização
        if (tipoVisualizacao === "Símbolos Proporcionais") 
            rotaEndpoint = "proportional";
        else if (tipoVisualizacao === "Coroplético") {
            rotaEndpoint = "choropleth";
            // LIGA a tela de carregamento antes de fazer o fetch
            loadingOverlay.style.display = "flex";
        }

        const response = await fetch(`http://localhost:5000/${rotaEndpoint}?${queryString}`);

        const data = await response.json();
        
        // se o usuário já mudou de ideia e fez outra requisição enquanto 
        // essa estava carregando (demorando), nós simplesmente descartamos essa resposta velha
        if (idDestaRequisicao !== idRequisicaoAtual) {
            console.log("Requisição atrasada ignorada. O usuário já mudou de visualização.");
            return;
        }

        if (data.error) {
            console.error('Erro na busca:', data.error);
            return;
        }

        // se for coroplético, passa os dados direto para uma nova função de plotagem
        if (tipoVisualizacao === "Coroplético") {
            plotarCoropletico(data);
            if (contagemPontos)
                contagemPontos.textContent = 'Modo Coroplético ativado';

            // DESLIGA a tela de carregamento após desenhar o mapa
            loadingOverlay.style.display = "none";

            return; // para a execução aqui, não segue para o plotarPontos()
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
        loadingOverlay.style.display = "none";
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