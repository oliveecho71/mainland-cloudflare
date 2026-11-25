export type CourseIntro = {
  title: string;
  summary: string;
  stages: { title: string; detail: string }[];
  note: string;
};

export const defaultCourseIntro: CourseIntro = {
  title: "从展位跟拍到真实项目执行",
  summary: "10次展会现场带教，接续10次展会、会议与各类活动跟拍。",
  stages: [
    { title: "展会必拍项目", detail: "4次 · 建立完整画面清单" },
    { title: "现场拍摄进阶", detail: "3次 · 练习光线与人物互动" },
    { title: "独立执行练习", detail: "3次 · 轮流主导拍摄任务" },
    { title: "真实项目跟拍", detail: "10次 · 逐步承担客户任务" },
  ],
  note: "具体项目以客户许可和实际排期为准。课前提供电子主教程和一次线上准备课。",
};
