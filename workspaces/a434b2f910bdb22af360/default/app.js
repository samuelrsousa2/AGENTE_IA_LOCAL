// importar as funções do web search e web read
const webSearch = web_search();
const webRead = web_read();

// definição do jogo
function Game() {
  let board = [[], [], []];
  let currentPlayer = 'X';
  let gameWon = false;

  // define a função para mover o círculo
  function moveCell(row, col) {
    if (board[row][col] === undefined) {
      board[row][col] = currentPlayer;
      if (checkWin(board)) {
        gameWon = true;
        currentPlayer = 'O';
      } else if (currentPlayer === 'O') {
        currentPlayer = 'X';
      }
    }
    return board;
  }

  // define a função para ver se um jogador ganhou
  function checkWin(board) {
    const lines = [
      [0, 1, 2], 
      [0, 5, 4], 
      [1, 2, 3]
    ];
    for (let i = 0; i < 3; i++) {
      if (board[i][0] === undefined && board[i][1] === undefined && board[i][2] === undefined) {
        if (board[i[0]][i[1]] === currentPlayer) return true;
      }
    }
    return false;
  }

  // defini a função para ver o board
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

  // define a função para executar o jogo
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
    webSearch('https://www.gamemuseum.com/2024/tic-tac-toe');
    webRead('https://www.gamemuseum.com/2024/tic-tac-toe');
    webRead('https://www.gamemuseum.com/2024/tic-tac-toe');
    webRead('https://www.gamemuseum.com/2024/tic-tac-toe');
    showBoard(board);
  }
}

// defini o main do jogo
function main() {
  startGame();
}

// executar o jogo
main();
