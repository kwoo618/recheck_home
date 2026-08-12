import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * next dev가 CLAUDE.md 같은 에이전트 규칙 파일을 자동으로 수정하는 것을 끈다.
   *
   * 이 저장소는 두 개의 worktree(main / feat/screens)에서 세션을 병렬로 굴린다.
   * 양쪽 dev 서버가 각자 CLAUDE.md를 건드리면 같은 파일이 서로 다르게 바뀌어
   * 병합할 때마다 충돌이 난다. CLAUDE.md는 사람이 관리하는 규칙 문서다.
   */
  agentRules: false,
};

export default nextConfig;
