const workflow = [
  { step: "01", title: "주제 확인", description: "문제를 한 문장으로 정의합니다." },
  { step: "02", title: "MVP 완성", description: "핵심 흐름을 먼저 끝까지 연결합니다." },
  { step: "03", title: "역할 분배", description: "화면과 기능을 나눠 동시에 개선합니다." },
  { step: "04", title: "배포·검증", description: "main 기준으로 Azure에서 확인합니다." },
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="status"><span /> Azure 배포 준비 완료</div>
        <p className="eyebrow">MATDATHON 2026</p>
        <h1>아이디어를<br />작동하는 MVP로.</h1>
        <p className="lead">
          한 명이 핵심 흐름을 만들고, 팀원이 기능과 화면을 나눠 빠르게 완성합니다.
        </p>
        <a className="cta" href="#workflow">진행 방식 보기 <span>→</span></a>
      </section>

      <section className="workflow" id="workflow" aria-labelledby="workflow-title">
        <div className="section-heading">
          <p>HOW WE BUILD</p>
          <h2 id="workflow-title">오늘의 개발 흐름</h2>
        </div>
        <div className="cards">
          {workflow.map((item) => (
            <article className="card" key={item.step}>
              <span>{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <strong>맛다톤 2026</strong>
        <span>Next.js · GitHub Actions · Azure</span>
      </footer>
    </main>
  );
}
