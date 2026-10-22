export default function Steps() {
  const steps = ['Choose your dress', 'Send a booking request', 'Pay after confirmation'];
  return (
    <section className="wrap" aria-label="How it works">
      <ol className="steps" style={{ listStyle: 'none', margin: 0, paddingLeft: 0 }}>
        {steps.map((s, i) => (
          <li key={s} className="step">
            <span className="num">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
