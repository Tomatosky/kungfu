import { KfLayoutDirection } from '@kungfu-trader/kungfu-app/src/typings/enums';
import { useBoardFilter } from '../methods/uiUtils';

const { getBoard } = useBoardFilter();

const getBoardSizeNum = (size: string | number | undefined) => {
  if (typeof size === 'string') {
    if (size.endsWith('%')) {
      return Number(size.slice(0, size.length - 1));
    }
  }

  return 0;
};

const dealBoardMap = (boardsMap: KfLayout.BoardsMap) => {
  const dealBoard = (numKey: number) => {
    const currentBoard = boardsMap[numKey];

    if (currentBoard) {
      if ('children' in currentBoard) {
        const childrenResolved = currentBoard.children
          .map((childKey) => dealBoard(childKey))
          .filter((item) => item !== -1);
        if (!childrenResolved.length) {
          return -1;
        } else {
          let residue = 0;
          const curSizeKey =
            currentBoard.direction === KfLayoutDirection.v ? 'height' : 'width';

          currentBoard.children = currentBoard.children.filter((childId) => {
            if (childrenResolved.includes(childId)) {
              return true;
            } else {
              const curSize = boardsMap[childId][curSizeKey];
              residue += getBoardSizeNum(curSize);
              delete boardsMap[childId];
              return false;
            }
          });

          const everySize = residue / currentBoard.children.length;

          currentBoard.children.forEach((childKey) => {
            const curChildBoardSize = getBoardSizeNum(
              boardsMap[childKey][curSizeKey],
            );
            boardsMap[childKey][curSizeKey] = `${
              curChildBoardSize + everySize
            }%`;
          });

          return numKey;
        }
      }

      if ('contents' in currentBoard && currentBoard.contents.length) {
        const contentsResolved = currentBoard.contents
          .map((content) =>
            getBoard(
              typeof content === 'string' ? content : content.id,
              content,
              '',
            ),
          )
          .filter((item) => !!item);
        if (!contentsResolved.length) {
          return -1;
        } else {
          currentBoard.contents = contentsResolved;
          currentBoard.current =
            typeof contentsResolved[0] === 'string'
              ? contentsResolved[0]
              : contentsResolved[0].id;
          return numKey;
        }
      }
    }

    return -1;
  };

  dealBoard(0);

  return boardsMap;
};

const baseBoardsMap: KfLayout.BoardsMap = {
  '0': { paId: -1, id: 0, direction: KfLayoutDirection.h, children: [1, 2] },
  '1': {
    paId: 0,
    id: 1,
    direction: KfLayoutDirection.v,
    children: [4, 5],
    width: '64.620%',
  },
  '2': {
    paId: 0,
    id: 2,
    direction: KfLayoutDirection.v,
    children: [8, 9, 10],
    width: '35.380%',
  },
  '4': {
    paId: 1,
    id: 4,
    direction: KfLayoutDirection.h,
    contents: ['Td'],
    current: 'Td',
    height: '23.294%',
    width: 0,
  },
  '5': {
    paId: 1,
    id: 5,
    direction: KfLayoutDirection.h,
    children: [14, 13],
    width: 0,
    height: '76.706%',
  },
  '8': {
    paId: 2,
    id: 8,
    direction: KfLayoutDirection.h,
    contents: ['Md', 'Operator'],
    current: 'Md',
    height: '17.577%',
  },
  '9': {
    paId: 2,
    id: 9,
    direction: KfLayoutDirection.h,
    contents: ['Pos'],
    current: 'Pos',
    height: '28.157%',
  },
  '10': {
    paId: 2,
    id: 10,
    direction: KfLayoutDirection.h,
    children: [11, 12],
    height: '54.266%',
  },
  '11': {
    paId: 10,
    id: 11,
    direction: KfLayoutDirection.v,
    contents: ['OrderBook'],
    current: 'OrderBook',
    width: '41.424%',
  },
  '12': {
    paId: 10,
    id: 12,
    direction: KfLayoutDirection.v,
    contents: ['MakeOrder'],
    current: 'MakeOrder',
    width: '58.576%',
  },
  '13': {
    paId: 5,
    id: 13,
    direction: KfLayoutDirection.v,
    contents: ['MarketData'],
    current: 'MarketData',
    width: '23.045%',
  },
  '14': {
    paId: 5,
    id: 14,
    direction: KfLayoutDirection.v,
    width: '76.955%',
    children: [16, 15],
  },
  '15': {
    paId: 14,
    id: 15,
    direction: KfLayoutDirection.h,
    contents: ['Order', 'Trade'],
    current: 'Order',
    height: '50%',
  },
  '16': {
    paId: 14,
    id: 16,
    direction: KfLayoutDirection.h,
    contents: ['Strategy', 'TradingTask', 'PosGlobal'],
    current: 'Strategy',
    height: '50%',
  },
};

export const defaultBoardsMap = dealBoardMap(baseBoardsMap);
