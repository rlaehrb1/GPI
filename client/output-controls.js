// Reuses the portable bundle's React and button/icons; no extra runtime library.
export function createOutputControls(React, Button, icons) {
  const h = React.createElement;
  function OutputMode({ value, onChange, disabled }) {
    return h('fieldset', { className: 'output-mode', disabled },
      h('legend', null, '프롬프트 출력 방식'),
      h('div', { className: 'output-mode-options' },
        ...[
          ['narrative', '서술형', 'Person · Body · Outfit 항목별 문장'],
          ['booru', 'Booru 태그형', 'Danbooru · Gelbooru 스타일 태그']
        ].map(([id, label, description]) => h('label', { key: id, className: value === id ? 'selected' : '' },
          h('input', { type: 'radio', name: 'outputFormat', value: id, checked: value === id, onChange: () => onChange(id) }),
          h('span', null, h('strong', null, label), h('small', null, description))
        ))
      ),
      h('p', null, value === 'booru' ? '예: long_hair, white_shirt, pleated_skirt' : '이미지를 문장으로 자세히 묘사합니다.')
    );
  }
  function ActionBar({ keyword, setKeyword, busy, canGenerate, imageReady, generate, retry, cancel }) {
    return h(React.Fragment, null,
      h('label', { className: 'toolbar-keyword', htmlFor: 'keyword' },
        h('span', null, '키워드'),
        h('input', { id: 'keyword', value: keyword, onChange: e => setKeyword(e.target.value), placeholder: '선택 키워드', disabled: busy, maxLength: 120 })
      ),
      h('div', { className: 'toolbar-generation' },
        h(Button, { icon: icons.generate, className: 'primary', onClick: generate, disabled: !canGenerate, busy }, '생성 ', h('kbd', null, 'F1')),
        h(Button, { icon: icons.retry, onClick: retry, disabled: !imageReady || busy, title: '같은 이미지로 다시 생성', 'aria-label': 'Retry' }, h('kbd', null, 'F5')),
        h(Button, { icon: icons.cancel, onClick: cancel, disabled: !busy, title: '생성 중단', 'aria-label': 'Esc' }, h('kbd', null, 'Esc'))
      )
    );
  }
  return { OutputMode, ActionBar };
}
