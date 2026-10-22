export function ConsentExplainer() {
  return (
    <div className="notice info small">
      <strong>About collective insights.</strong> If you opt in, CaseCommons counts this case together with similar ones,
      using only its <em>issue category</em>, the <em>organisation</em> and its <em>review status</em>. This helps show where the
      same problem keeps happening. Your description, documents and name are never shown. Groups of fewer than 3 cases are hidden,
      but a small count is not truly anonymous: people who know the circumstances might still recognise them.
      This is separate from sharing with a counsellor. You can withdraw at any time, and future counts will leave your case out.
      <span className="hint">Policy version: collective-analysis-v1</span>
    </div>
  );
}
