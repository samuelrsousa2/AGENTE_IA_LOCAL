// importar as funções do web search e web read
const webSearch = web_search();
const webRead = web_read();

function webSearch(url) {
  return web_search(board);
}

function webRead(url) {
  return web_read(board);
}

function startGame() {
  webRead('http://localhost:3001'); // carregar o board do jogo
  webSearch('https://www.gamemuseum.com'); // ver se há jogos possíveis
  webRead('https://www.gamemuseum.com/2024/tic-tac-toe'); // carregar mais informações
  board = webRead('https://www.gamemuseum.com/2024/tic-tac-toe');
  webSearch('https://www.gamemuseum.com/2024/tic-tac-toe');
  webRead('https://www.gamemuseum.com/2024/tic-tac-toe');
  webRead('https://www.gamemuseum.com/2024/tic-tac-toe');
  webSearch('https://www.gamemuseum.com/2024/tic-tac-toe');
  webRead('https://www.gamemuseum.com/2024/tic-tac-toe');
  webRead('https://www.gamemuseum.com/2024/tic-tac-toe');
  webRead('https://www.gamemuseum.com/2024/tic-tac-toe');
  showBoard(board);
}

function showBoard(board) {
  const result = document.getElementById('board').value;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[i][j] === undefined) {
        result.innerHTML += '<i style="color: red;">X</i>';
      } else {
        result.innerHTML += '<i style="color: black;">O</i>';
      }
    }
  }
}
