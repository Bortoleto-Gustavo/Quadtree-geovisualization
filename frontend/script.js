const inputCSV = document.getElementById("csv");
const botao = document.querySelector("button");

let arquivoSelecionado = null;

inputCSV.addEventListener("change", (event) => {
    arquivoSelecionado = event.target.files[0];

    if (arquivoSelecionado) {
        alert(`Arquivo selecionado: ${arquivoSelecionado.name}`);
    }
});

botao.addEventListener("click", () => {

    if (!arquivoSelecionado) {
        alert("OPS! Selecione um CSV primeiro!");
        return;
    }

    const tipo = document.getElementById("visualizacao").value;

    alert(
        `Visualização: ${tipo}\nArquivo: ${arquivoSelecionado.name}`
    );
});