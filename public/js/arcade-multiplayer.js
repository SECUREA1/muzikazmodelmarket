// Modes deliberately exclude games with private hands or individual credit wagers.
export const VERSUS_GAMES=['tictactoe','connect4','pong'];
export const COOP_GAMES=['memory','lights','mines','maze','merge2048','sliding8','hangman','scramble','codebreaker','battleship','peg','sudoku4','shutbox','simon'];
export const multiplayerMode=type=>VERSUS_GAMES.includes(type)?'versus':COOP_GAMES.includes(type)?'coop':null;
