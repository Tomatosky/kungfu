import fse from 'fs-extra';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import { Modal, ModalFuncProps } from 'ant-design-vue';
import { messagePrompt } from '../uiUtils';
import { h } from 'vue';
import markdown from './md';

export { markdown };

const { t } = VueI18n.global;

export const compileMd2Html = (content: string): string => {
  try {
    return (
      '<div class="kf-markdown__wrap markdown-body">' +
      markdown.render(content) +
      '</div>'
    );
  } catch (error) {
    console.error(error);
    return '';
  }
};

export const compileMdFile2Html = (filePath: string): string => {
  if (fse.existsSync(filePath)) {
    const buffer = fse.readFileSync(filePath);
    return compileMd2Html(buffer.toString());
  }

  return '';
};

export const openReadmeModal = (
  readmePath: string,
  extraConfig?: ModalFuncProps,
) => {
  if (fse.existsSync(readmePath)) {
    return fse.readFile(readmePath).then((buffer) => {
      const str = buffer.toString();
      const mdHtml = markdown.render(str);
      const content = h('div', {
        class: 'kf-markdown__wrap markdown-body',
        style: {
          maxHeight: '60vh',
          overflow: 'auto',
        },
        innerHTML: mdHtml,
      });
      return Modal.info({
        content: content,
        width: '60vw',
        okText: t('confirm'),
        cancelText: t('cancel'),
        ...(extraConfig || {}),
      });
    });
  } else {
    messagePrompt().error(t('文件路径不存在'));
    return Promise.reject();
  }
};
