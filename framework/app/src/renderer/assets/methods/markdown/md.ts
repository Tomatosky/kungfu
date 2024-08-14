import md from 'markdown-it';
import mdHljs from 'markdown-it-highlightjs';
import mdCheckbox from 'markdown-it-task-checkbox-pro';
import hlForCpp from 'highlight.js/lib/languages/cpp';
import hlForPython from 'highlight.js/lib/languages/python';
import hlForJs from 'highlight.js/lib/languages/javascript';
import hlForTs from 'highlight.js/lib/languages/typescript';

const markdown = md();

markdown
  .use(mdHljs, {
    inline: true,
    register: {
      cpp: hlForCpp,
      python: hlForPython,
      js: hlForJs,
      ts: hlForTs,
    },
  })
  .use(mdCheckbox, {
    divWrap: true,
    divClass: 'kf-md-checkbox',
  });

export default markdown;
