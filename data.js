// localStorage に保存するときのキーです。
const LIFE_PLAN_STORAGE_KEY = "lifePlanLocal.data.v1";

// イベント登録で選べるカテゴリ一覧です。
const EVENT_CATEGORIES = [
  "教育",
  "住宅",
  "車",
  "保険",
  "旅行",
  "出産",
  "医療",
  "老後",
  "その他"
];

// アプリを初めて開いたときに使う初期データです。
const initialLifePlanData = {
  settings: {
    startYear: 2026,
    endYear: 2056
  },
  family: [
    {
      id: "family_1",
      name: "本人",
      birthDate: "1992-01-01",
      relationship: "本人",
      memo: ""
    },
    {
      id: "family_2",
      name: "配偶者",
      birthDate: "1992-01-01",
      relationship: "配偶者",
      memo: ""
    },
    {
      id: "family_3",
      name: "子ども1",
      birthDate: "2020-06-01",
      relationship: "子",
      memo: ""
    },
    {
      id: "family_4",
      name: "子ども2",
      birthDate: "2024-09-01",
      relationship: "子",
      memo: ""
    },
    {
      id: "family_5",
      name: "子ども3",
      birthDate: "2026-10-01",
      relationship: "子",
      memo: ""
    }
  ],
  events: [
    {
      id: "event_1",
      name: "子ども1 小学校入学",
      targetFamilyId: "family_3",
      scheduledYear: null,
      targetAge: 6,
      amount: 200000,
      category: "教育",
      memo: ""
    },
    {
      id: "event_2",
      name: "子ども1 中学校入学",
      targetFamilyId: "family_3",
      scheduledYear: null,
      targetAge: 12,
      amount: 300000,
      category: "教育",
      memo: ""
    },
    {
      id: "event_3",
      name: "子ども1 高校入学",
      targetFamilyId: "family_3",
      scheduledYear: null,
      targetAge: 15,
      amount: 500000,
      category: "教育",
      memo: ""
    },
    {
      id: "event_4",
      name: "子ども1 大学入学",
      targetFamilyId: "family_3",
      scheduledYear: null,
      targetAge: 18,
      amount: 1000000,
      category: "教育",
      memo: ""
    },
    {
      id: "event_5",
      name: "車買い替え",
      targetFamilyId: null,
      scheduledYear: 2030,
      targetAge: null,
      amount: 2500000,
      category: "車",
      memo: ""
    }
  ],
  assets: {
    cash: 3000000,
    investments: 1000000,
    insurance: 0,
    otherAssets: 0,
    liabilities: 25000000
  },
  income: {
    salary: 6000000,
    bonus: 0,
    allowance: 360000,
    otherIncome: 0,
    yearlyChanges: []
  },
  expenses: {
    livingMonthly: 250000,
    mortgageMonthly: 80000,
    insuranceMonthly: 30000,
    educationMonthly: 30000,
    carMonthly: 30000,
    otherFixedMonthly: 50000
  }
};
