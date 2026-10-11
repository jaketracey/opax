// Minimal DOM boundary for URL/privacy tests; SSR strings remain unparsed.
// Real interactions, focus, accessibility and layout are checked in Chrome.
export function tableHarness(initialURL = 'http://localhost/table') {
  const win = new EventTarget();
  win.location = {href:initialURL};
  win.history = {state:null,replaceState(_state,_title,url) { win.location.href = String(url); }};
  Object.assign(win,{CustomEvent,AbortController,URL,Blob,setTimeout,clearTimeout});
  const root = new EventTarget();
  root.dataset = {}; root.childNodes = []; root.classList = {add(){}};
  root.contains = () => false; root.querySelectorAll = () => []; root.querySelector = () => null;
  const attrs=new Map();
  root.setAttribute=(key,value)=>attrs.set(key,value);root.removeAttribute=key=>attrs.delete(key);root.hasAttribute=key=>attrs.has(key);
  root.append = (...nodes) => { root.childNodes.push(...nodes); };
  const head = {querySelector:()=>null,append(){}};
  const doc = {defaultView:win,head,createElement(kind) {
    if (kind === 'template') {
      const template = {content:{}};
      Object.defineProperty(template,'innerHTML',{set(html) {
        const node = {html,remove() { root.childNodes = root.childNodes.filter(n=>n !== node); }};
        template.content.firstElementChild = {childNodes:[node]};
      }});
      return template;
    }
    return {setAttribute(){},remove(){}};
  }};
  root.ownerDocument = doc;
  return {root,win,html:()=>root.childNodes.map(n=>n.html || '').join('')};
}
