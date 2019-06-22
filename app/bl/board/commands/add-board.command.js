// The command is a Proxy on a Service method
// with additional functionality - it records the data
// about command to the command stack
let BoardService, Commands;

function addBoardCmd(board) {
    let boardId = null;

    const command = async () => {
        boardId = await BoardService.add(board);
    };

    command.undo = async () => {
        if (boardId) {
            await BoardService.del(boardId);
            boardId = null;
        }
    };

    command.serialize = () => {
        return {
            action: Commands.ADD_BOARD_CMD,
            payload: {
                board,
                boardId
            }
        };
    };

    return command;
}

module.exports = (boardService, commands) => {
    BoardService = boardService;
    Commands = commands;

    return { addBoardCmd };
};
