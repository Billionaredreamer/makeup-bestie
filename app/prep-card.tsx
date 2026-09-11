export function PrepCard() {
  return <aside className="prep-card" aria-label="Before you start">
    <h2>Before you start</h2>
    <ul>{["Clean face","Moisturiser on, given a minute","Hair back"].map(item=><li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
  </aside>;
}
