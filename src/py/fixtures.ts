/** 채점기 테스트(§7.2)용 자료 구조. 과제마다 일부러 틀린 코드 3종 이상과 경계 사례를 둔다. */
export interface TaskFixtures {
  /** 반드시 탈락해야 하는 코드 */
  wrong: { name: string; code: string }[];
  /** 경계 사례: 통과해야 하는지 여부를 명시 */
  edge: { name: string; code: string; shouldPass: boolean }[];
}
