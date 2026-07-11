/** Keeps the textarea caret inside its visible scroll box while typing. */
export function ensureTextareaCaretVisible(textarea: HTMLTextAreaElement) {
  const style = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;

  const value = textarea.value;
  const caret = textarea.selectionStart ?? value.length;
  const textBefore = value.slice(0, caret);
  const lineIndex = textBefore.split("\n").length - 1;

  const caretTop = paddingTop + lineIndex * lineHeight;
  const caretBottom = caretTop + lineHeight;
  const viewTop = textarea.scrollTop;
  const viewBottom = viewTop + textarea.clientHeight;
  const inset = 10;

  if (caretTop < viewTop + inset) {
    textarea.scrollTop = Math.max(0, caretTop - inset);
    return;
  }

  if (caretBottom > viewBottom - inset) {
    textarea.scrollTop = caretBottom - textarea.clientHeight + inset;
  }
}
