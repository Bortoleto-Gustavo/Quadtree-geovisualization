const inputCSV = document.getElementById("csv");
const botao = document.querySelector("button");

let arquivoSelecionado = null;

// salva o arquivo quando o usuário seleciona
inputCSV.addEventListener("change", (event) => {
    arquivoSelecionado = event.target.files[0];

    if (arquivoSelecionado) {
        alert(`Arquivo selecionado: ${arquivoSelecionado.name}`);
    }
});

// ação do botão "atualizar mapa"
botao.addEventListener("click", async () => {

    if (!arquivoSelecionado) {
        alert("OPS! Selecione um CSV primeiro!");
        return;
    }

    // prepara os dados para enviar como "multipart/form-data"
    const formData = new FormData();
    formData.append("file", arquivoSelecionado);

    try {
        // muda o texto do botão
        botao.innerText = "Carregando...";
        
        // dispara o arquivo para a API
        const response = await fetch("http://localhost:5000/upload", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            alert(`Sucesso! Arquivo processado com ${data.rows} linhas`);
            // mapa carrega os pontos assim que o upload termina
            loadPoints();
        }
        else {
            alert(`Erro ao processar: ${data.error}`);
        }

    } catch (error) {
        console.error("Erro no upload:", error);
        alert("Erro ao enviar o arquivo para o servidor");
    } finally {
        // muda o texto do botão de volta para o original
        botao.innerText = "Atualizar Mapa";
    }
});

// mapa do Brasil
var map = L.map('map').setView([-15.4, -55], 4);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// camada para guardar os marcadores atuais
let markersLayer = L.layerGroup().addTo(map);

// função que busca os pontos da API com base na visão atual do mapa
async function loadPoints() {
        const bounds = map.getBounds();
        
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();

        try {
            // chama a rota /points
            const response = await fetch(`http://localhost:5000/points?north=${north}&south=${south}&east=${east}&west=${west}`);
            const data = await response.json();

            // limpa os pontos antigos para evitar duplicação
            markersLayer.clearLayers();

            // adiciona os novos pontos na tela
            data.forEach(point => {
                // LEAFLET SÓ ACEITA COORDENADAS NO FORMATO [lat, lng]
                L.circleMarker([point.latitude, point.longitude], {
                    radius: 5,
                    color: 'blue',
                    fillOpacity: 0.7
                }).addTo(markersLayer)
                  .bindPopup(`<b>Dado:</b> ${JSON.stringify(point)}`);
            });

        } catch (error) {
            console.error("Erro ao carregar pontos:", error);
        }
    }

// dispara a busca sempre que o usuário parar de mover / dar zoom no mapa
map.on('moveend', loadPointsInView);

// carrega os pontos iniciais ao abrir a tela
loadPoints();