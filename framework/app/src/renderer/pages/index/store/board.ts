import { StoreDefinition, defineStore, _UnwrapAll } from 'pinia';
import {
  KfLayoutDirection,
  KfLayoutTargetDirectionClassName,
} from '@kungfu-trader/kungfu-app/src/typings/enums';
import {
  onDeactivated,
  onActivated,
  onUnmounted,
  ref,
  toRaw,
  getCurrentInstance,
  Ref,
  inject,
} from 'vue';
import { Subscription } from 'rxjs';
import { messagePrompt } from '../../../assets/methods/uiUtils';
import { useGlobalStore } from './global';
import { storeToRefs } from 'pinia';
import {
  BuiltinComponentInjectKeysMap,
  UIHelperInjectKeysMap,
} from '../../../assets/configs/symbols';
import { provide } from 'vue';

// 对应store中的state
interface StateTree {
  needCached: Ref<boolean>;
  boardsMap: Ref<KfLayout.BoardsMap>;
  draggedContentData: Ref<KfLayout.ContentData | null>;
  isBoardDragging: Ref<boolean>;
}
// 对应store中的action
interface ActionsTree {
  markIsBoardDragging: (status: boolean) => void;
  initBoardsMap: (boardMap: KfLayout.BoardsMap) => void;
  getContentId: (content: KfLayout.Content) => string;
  setBoardsMapAttrById: <T extends KfLayout.BoardInfoKeys>(
    id: number,
    attrKey: T,
    value: (KfLayout.WrapperBoardInfo &
      KfLayout.DefaultContentBoardInfo &
      KfLayout.CustomContentBoardInfo)[T],
  ) => void;
  addBoardFromEmpty: (targetContentId: string) => void;
  addBoardByContent: (
    targetBoardId: number,
    targetContent: KfLayout.Content,
  ) => KfLayout.Content;
  removeBoardByContent: (
    targetBoardId: number,
    targetContent: KfLayout.Content,
  ) => void;
  setDraggedContentData: (
    boardId: KfLayout.BoardId,
    content: KfLayout.Content,
  ) => void;
  afterDragMoveBoard: (
    draggedContentData: KfLayout.ContentData | null,
    destBoardId: KfLayout.BoardId,
    directionClassName: KfLayoutTargetDirectionClassName,
  ) => void;
  saveBoardsMap: () => Promise<void>;
}

type combineType = StateTree & ActionsTree;
type BoardStoreDefinition = StoreDefinition<
  `${string}_boardsStore`,
  _UnwrapAll<Pick<combineType, keyof StateTree>>,
  Pick<combineType, never>, // never在有computed的时候用，对应store中getter
  Pick<combineType, keyof ActionsTree>
>;
declare global {
  interface Window {
    allBoardsStore: Record<string, BoardStoreDefinition>;
  }
}

export const useBoards = () => {
  const app = getCurrentInstance();
  const { success } = messagePrompt();

  function getContentId(content: KfLayout.Content) {
    return typeof content === 'string' ? content : content.id;
  }

  const createBoardsStore = (
    storeId: string,
    initBoardMap: KfLayout.BoardsMap,
    defaultBoardsMap: KfLayout.BoardsMap,
    cached = true,
  ) => {
    const useBoardsStore = defineStore(`${storeId}_boardsStore`, () => {
      const needCached = ref(cached);
      const boardsMap = ref<KfLayout.BoardsMap>(initBoardMap);
      const draggedContentData = ref<KfLayout.ContentData | null>(null);
      const isBoardDragging = ref<boolean>(false);

      const { currentBoardsStoreId } = storeToRefs(useGlobalStore());
      const localBoardsMapKey = `${storeId}_boardsMap`;

      let subscription: Subscription | undefined;
      onActivated(() => {
        currentBoardsStoreId.value = storeId;
        subscription = app?.proxy?.$globalBus.subscribe(
          (data: KfEvent.KfBusEvent) => {
            if (data.tag === 'main') {
              if (data.name === 'reset-current-dashboard') {
                console.log('reset-current-dashboard', defaultBoardsMap);
                initBoardsMap(defaultBoardsMap);
                success();
              }

              if (data.name == 'record-before-quit') {
                Object.values(window.allBoardsStore).forEach((useStore) => {
                  const store = useStore();
                  store.needCached && store.saveBoardsMap();
                });
              }
            }
          },
        );
      });

      onDeactivated(() => {
        subscription && subscription.unsubscribe();
      });

      onUnmounted(() => {
        subscription && subscription.unsubscribe();
        cached && saveBoardsMap();
      });

      function markIsBoardDragging(status: boolean) {
        isBoardDragging.value = status;
      }

      function initBoardsMap(boardMap: KfLayout.BoardsMap) {
        boardsMap.value = JSON.parse(JSON.stringify(boardMap));
      }

      function setBoardsMapAttrById<
        T extends keyof (KfLayout.WrapperBoardInfo & KfLayout.ContentBoardInfo),
      >(
        id: number,
        attrKey: T,
        value: (KfLayout.WrapperBoardInfo & KfLayout.ContentBoardInfo)[T],
      ) {
        if (!boardsMap.value[id]) return;
        if (attrKey in boardsMap.value[id]) {
          (
            boardsMap.value[id] as KfLayout.WrapperBoardInfo &
              KfLayout.ContentBoardInfo
          )[attrKey] = value;
        }
      }

      function addBoardFromEmpty(targetContentId: string) {
        const newBoardInfo: KfLayout.ContentBoardInfo = {
          paId: 0,
          id: 1,
          direction: KfLayoutDirection.v,
          contents: [targetContentId],
          current: targetContentId,
          width: '100%',
          height: '100%',
        };
        boardsMap.value[1] = newBoardInfo;
        (boardsMap.value[0] as KfLayout.WrapperBoardInfo).children = [1];
      }

      function addBoardByContent(
        targetBoardId: number,
        targetContent: KfLayout.Content,
      ) {
        const targetBoard = boardsMap.value[targetBoardId];

        if (!('contents' in targetBoard)) return;

        const contents = targetBoard.contents;
        const targetContentId = getContentId(targetContent);
        const targetIndex = contents.findIndex(
          (i) => getContentId(i) === targetContentId,
        );

        if (targetIndex !== -1) return;

        contents.push(targetContent);
        targetBoard.current = getContentId(targetContent);
        return targetContent;
      }

      function removeBoardByContent(
        targetBoardId: number,
        targetContent: KfLayout.Content,
      ) {
        const targetBoard = boardsMap.value[targetBoardId];

        if (!('contents' in targetBoard)) return;

        const contents = targetBoard.contents;
        const targetContentId = getContentId(targetContent);
        const targetIndex = contents.findIndex(
          (content) => getContentId(content) === targetContentId,
        );

        if (targetIndex === -1) return;

        const removedItem: KfLayout.Content =
          contents.splice(targetIndex, 1)[0] || '';
        const removedItemId = getContentId(removedItem);

        if (removedItemId === targetBoard.current && contents.length) {
          const newCurrentContent = targetBoard.contents[0];
          const current = getContentId(newCurrentContent);
          targetBoard.current = current;
        }

        if (!contents?.length && targetBoard.paId != -1) {
          removeBoardByBoardId_(targetBoardId);
        }
      }

      function removeBoardByBoardId_(targetBoardId: number) {
        const targetBoard = boardsMap.value[targetBoardId];
        if (targetBoard && targetBoard.paId !== -1) {
          const paId = targetBoard.paId;
          const paBoard = boardsMap.value[paId];

          if (!('children' in paBoard)) return;

          const children = paBoard.children;
          const childIndex = paBoard.children.indexOf(targetBoardId);

          if (childIndex === -1) return;

          children?.splice(childIndex, 1);

          if (!children?.length) {
            removeBoardByBoardId_(paId);
          } else {
            children.forEach((childId: KfLayout.BoardId) => {
              boardsMap.value[childId].width = 0;
              boardsMap.value[childId].height = 0;
            });
          }

          delete boardsMap.value[targetBoardId];
        }
        return;
      }

      function setDraggedContentData(
        boardId: KfLayout.BoardId,
        content: KfLayout.Content,
      ) {
        if (boardId === -1 && !content) {
          draggedContentData.value = null;
        } else {
          draggedContentData.value = {
            content,
            boardId,
          };
        }
      }

      function afterDragMoveBoard(
        draggedContentData: KfLayout.ContentData | null,
        destBoardId: KfLayout.BoardId,
        directionClassName: KfLayoutTargetDirectionClassName,
      ) {
        const { boardId, content } = draggedContentData || {};
        const destBoard = boardsMap.value[destBoardId];

        if (!content || boardId === undefined || !('contents' in destBoard))
          return;

        //to self
        if (
          boardId === destBoardId &&
          destBoard.contents &&
          destBoard.contents.length === 1
        ) {
          return;
        }

        removeBoardByContent(boardId, content);

        if (directionClassName === KfLayoutTargetDirectionClassName.center) {
          if (destBoard.contents) {
            const contentId = getContentId(content);
            if (
              !destBoard.contents.find((i) => getContentId(i) === contentId)
            ) {
              destBoard.contents.push(content);
            }
            destBoard.current = getContentId(content);
          }
        } else if (
          directionClassName != KfLayoutTargetDirectionClassName.unset
        ) {
          dragMakeNewBoard_(content, destBoardId, directionClassName);
        }
      }

      function dragMakeNewBoard_(
        content: KfLayout.Content,
        destBoardId: number,
        directionClassName: KfLayoutTargetDirectionClassName,
      ) {
        const destBoard = boardsMap.value[destBoardId];
        const newWrapperBoard: KfLayout.WrapperBoardInfo = {
          paId: destBoard.paId,
          id: destBoardId,
          direction: destBoard.direction,
          children: [],
        };
        const destPaId: number = destBoard.paId;
        const destDirection: KfLayoutDirection = destBoard.direction;
        const newBoardId: KfLayout.BoardId = buildNewBoardId_();

        const newBoardDirection: KfLayoutDirection =
          directionClassName === KfLayoutTargetDirectionClassName.top ||
          directionClassName === KfLayoutTargetDirectionClassName.bottom
            ? KfLayoutDirection.h
            : directionClassName === KfLayoutTargetDirectionClassName.left ||
              directionClassName === KfLayoutTargetDirectionClassName.right
            ? KfLayoutDirection.v
            : KfLayoutDirection.unset;
        const newBoardInfo: KfLayout.BoardInfo = {
          paId: destPaId,
          id: newBoardId,
          direction: newBoardDirection,
          contents: [content],
          current: getContentId(content),
        };

        if (destDirection === newBoardDirection) {
          const destPa = boardsMap.value[destPaId];
          if (!('children' in destPa))
            throw new Error('Dest parent board is not a content board');

          const siblings = destPa.children;
          const destIndex = siblings.indexOf(destBoardId);
          if (destIndex === -1) {
            throw new Error("Insert dest board is not in pa board's children");
          }

          if (
            directionClassName === KfLayoutTargetDirectionClassName.top ||
            directionClassName === KfLayoutTargetDirectionClassName.left
          ) {
            siblings.splice(destIndex, 0, newBoardId);
          } else {
            siblings.splice(destIndex + 1, 0, newBoardId);
          }
        } else {
          newBoardInfo.paId = destBoardId;
          const newDestBoardId = newBoardId + 1;

          const newDestBoard: KfLayout.BoardInfo = {
            ...toRaw(destBoard),
            id: newDestBoardId,
            direction: newBoardDirection,
            paId: destBoardId,
            width: undefined,
            height: undefined,
          };

          if (
            directionClassName === KfLayoutTargetDirectionClassName.top ||
            directionClassName === KfLayoutTargetDirectionClassName.left
          ) {
            newWrapperBoard.children = [newBoardId, newDestBoardId];
          } else {
            newWrapperBoard.children = [newDestBoardId, newBoardId];
          }

          boardsMap.value[destBoardId] = newWrapperBoard;

          boardsMap.value[newDestBoardId] = newDestBoard;
        }

        destBoard.width && delete destBoard.width;
        destBoard.height && delete destBoard.height;

        boardsMap.value[newBoardId] = newBoardInfo;
      }

      function buildNewBoardId_(): KfLayout.BoardId {
        const boardIds = Object.keys(boardsMap.value)
          .map((key: string) => +key)
          .sort((key1: number, key2: number) => key2 - key1);
        return boardIds[0] + 1;
      }

      function saveBoardsMap(): Promise<void> {
        localStorage.setItem(
          localBoardsMapKey,
          JSON.stringify(boardsMap.value || '{}'),
        );
        return Promise.resolve();
      }

      return {
        needCached,
        boardsMap,
        draggedContentData,
        isBoardDragging,

        getContentId,
        markIsBoardDragging,
        initBoardsMap,
        setBoardsMapAttrById,
        addBoardFromEmpty,
        addBoardByContent,
        removeBoardByContent,
        setDraggedContentData,
        afterDragMoveBoard,
        saveBoardsMap,
      } as combineType;
    });

    window.allBoardsStore[storeId] = useBoardsStore;

    return useBoardsStore;
  };

  const getBoardsStoreById = (storeId: string) => {
    return window.allBoardsStore[storeId];
  };

  const getLocalBoardsMap = (storeId: string): KfLayout.BoardsMap | null => {
    const data = localStorage.getItem(`${storeId}_boardsMap`);
    if (!data) {
      return null;
    }

    const storedBoardsMap = JSON.parse(data) as KfLayout.BoardsMap;
    if (!Object.keys(storedBoardsMap).length) {
      return null;
    }

    return storedBoardsMap;
  };

  const currentBoardInfos = ref<{
    boardsId: string;
    boardId: number;
    boardInfo: KfLayout.BoardInfo;
    useBoardsStore: BoardStoreDefinition;
  } | null>(null);
  let injection = inject(BuiltinComponentInjectKeysMap.KfBoards, null);
  provide(UIHelperInjectKeysMap.KfBoards, {
    boardInfosMounter: (data) => {
      injection = data;
    },
  });
  const getCurrentBoardInfos = () => {
    if (currentBoardInfos.value) return currentBoardInfos.value;

    if (!injection) return null;

    const { boardId, boardsId } = injection;

    const useBoardsStore = getBoardsStoreById(boardsId);

    const boardInfo = useBoardsStore().boardsMap[boardId];

    const infos = {
      ...injection,
      boardInfo,
      useBoardsStore,
    };

    currentBoardInfos.value = infos;

    return infos;
  };

  const addContentToBoard = (
    targetBoardId: number,
    content: KfLayout.ContentNew,
  ) => {
    const infos = getCurrentBoardInfos();
    if (!infos) return;

    const { useBoardsStore } = infos;
    const { addBoardByContent } = useBoardsStore();

    const contentNew =
      typeof content === 'string'
        ? content
        : {
            id: content.component + Date.now(),
            ...content,
          };
    return addBoardByContent(targetBoardId, contentNew);
  };

  const addContentToCurBoard = (content: KfLayout.ContentNew) => {
    const infos = getCurrentBoardInfos();
    if (!infos) return;

    const { boardId } = infos;
    return addContentToBoard(boardId, content);
  };

  const removeContentInCurBoard = (content: KfLayout.Content) => {
    const infos = getCurrentBoardInfos();
    if (!infos) return;

    const { boardId, useBoardsStore } = infos;
    const { removeBoardByContent } = useBoardsStore();

    return removeBoardByContent(boardId, content);
  };

  const activeContentInCurBoard = (content: KfLayout.Content) => {
    const infos = getCurrentBoardInfos();
    if (!infos) return;

    const { boardId, useBoardsStore } = infos;
    const { setBoardsMapAttrById } = useBoardsStore();
    setBoardsMapAttrById(boardId, 'current', getContentId(content));
  };

  return {
    getBoardsStoreById,
    createBoardsStore,
    getLocalBoardsMap,
    getContentId,
    getCurrentBoardInfos,
    addContentToBoard,
    addContentToCurBoard,
    removeContentInCurBoard,
    activeContentInCurBoard,
  };
};
