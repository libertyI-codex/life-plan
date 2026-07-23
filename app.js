// アプリ全体で使う現在のデータと計算結果です。
let lifePlanData = null;
let lifePlanResults = [];
let messageTimerId = null;
let editingEventId = null;
let editingFamilyId = null;
let lifePlanUiState = null;
let editingNisaRecordIds = {};

// 2024年以降のNISA制度で使う固定値を1か所にまとめます。
const NISA_RULES = Object.freeze({
  startYear: 2024,
  annualTsumitateLimit: 1200000,
  annualGrowthLimit: 2400000,
  annualTotalLimit: 3600000,
  lifetimeTotalLimit: 18000000,
  lifetimeGrowthLimit: 12000000
});

// データを安全に複製します。
function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

// data.js の初期データをコピーして返します。
function getInitialDataCopy() {
  let initialData = null;

  if (typeof initialLifePlanData === "undefined") {
    initialData = {
      settings: {
        startYear: new Date().getFullYear(),
        endYear: new Date().getFullYear()
      },
      family: [],
      events: [],
      assets: {},
      income: {},
      expenses: {}
    };
  } else {
    initialData = cloneData(initialLifePlanData);
  }

  return ensureDataShape(initialData);
}

// localStorage の保存キーを取得します。
function getStorageKey() {
  if (typeof LIFE_PLAN_STORAGE_KEY === "undefined") {
    return "lifePlanLocal.data.v1";
  }

  return LIFE_PLAN_STORAGE_KEY;
}

// 画面の開閉状態は家計データとは別キーに保存します。
function getUiStateStorageKey() {
  return "lifePlanLocal.uiState.v1";
}

// UI状態の初期値を作ります。
function getDefaultUiState() {
  return {
    collapsedSections: {
      dashboard: false,
      calculationSettings: false,
      family: false,
      events: false,
      finance: false,
      nisa: false,
      dollarInsurance: false,
      chart: false,
      table: false,
      dataManagement: false
    },
    collapsedForms: {
      familyForm: false,
      eventForm: false,
      financeForm: false,
      dollarInsuranceForm: false,
      backupText: true
    },
    tableColumns: {
      familyAges: true,
      income: true,
      regularExpenses: true,
      eventExpenses: true,
      annualBalance: true,
      yearEndAssets: true,
      mortgage: true,
      netAssets: true,
      dollarInsurance: true
    },
    compactLifePlanTable: false
  };
}

// 古いUI状態に足りない項目があっても安全に補完します。
function ensureUiStateShape(uiState) {
  const defaultState = getDefaultUiState();
  const shapedState = uiState && typeof uiState === "object" && !Array.isArray(uiState) ? uiState : {};

  if (!shapedState.collapsedSections || typeof shapedState.collapsedSections !== "object") {
    shapedState.collapsedSections = {};
  }

  if (!shapedState.collapsedForms || typeof shapedState.collapsedForms !== "object") {
    shapedState.collapsedForms = {};
  }

  if (!shapedState.tableColumns || typeof shapedState.tableColumns !== "object") {
    shapedState.tableColumns = {};
  }

  Object.keys(defaultState.collapsedSections).forEach(function (key) {
    if (typeof shapedState.collapsedSections[key] !== "boolean") {
      shapedState.collapsedSections[key] = defaultState.collapsedSections[key];
    }
  });

  Object.keys(defaultState.collapsedForms).forEach(function (key) {
    if (typeof shapedState.collapsedForms[key] !== "boolean") {
      shapedState.collapsedForms[key] = defaultState.collapsedForms[key];
    }
  });

  Object.keys(defaultState.tableColumns).forEach(function (key) {
    if (typeof shapedState.tableColumns[key] !== "boolean") {
      shapedState.tableColumns[key] = defaultState.tableColumns[key];
    }
  });

  if (typeof shapedState.compactLifePlanTable !== "boolean") {
    shapedState.compactLifePlanTable = defaultState.compactLifePlanTable;
  }

  return shapedState;
}

// localStorage からUI状態を読み込みます。
function loadUiState() {
  try {
    const savedUiState = localStorage.getItem(getUiStateStorageKey());

    if (!savedUiState) {
      return getDefaultUiState();
    }

    return ensureUiStateShape(JSON.parse(savedUiState));
  } catch (error) {
    console.warn("UI状態の読み込みに失敗しました。", error);
    return getDefaultUiState();
  }
}

// UI状態を保存します。失敗しても家計データ本体には影響させません。
function saveUiState() {
  try {
    localStorage.setItem(getUiStateStorageKey(), JSON.stringify(getUiState()));
  } catch (error) {
    console.warn("UI状態の保存に失敗しました。", error);
  }
}

// 現在のUI状態を取得します。
function getUiState() {
  if (!lifePlanUiState) {
    lifePlanUiState = loadUiState();
  }

  return ensureUiStateShape(lifePlanUiState);
}

// セクションの折りたたみ状態を取得します。
function isSectionCollapsed(sectionKey) {
  return Boolean(getUiState().collapsedSections[sectionKey]);
}

// フォームの折りたたみ状態を取得します。
function isFormCollapsed(formKey) {
  return Boolean(getUiState().collapsedForms[formKey]);
}

// セクションの折りたたみ状態を変更します。
function setSectionCollapsed(sectionKey, isCollapsed) {
  getUiState().collapsedSections[sectionKey] = Boolean(isCollapsed);
  saveUiState();
}

// フォームの折りたたみ状態を変更します。
function setFormCollapsed(formKey, isCollapsed) {
  getUiState().collapsedForms[formKey] = Boolean(isCollapsed);
  saveUiState();
}

// ライフプラン表の列表示設定を取得します。
function getTableColumnSettings() {
  return getUiState().tableColumns;
}

// 指定した列グループを表示するかどうかを返します。
function isTableColumnVisible(columnKey) {
  return getTableColumnSettings()[columnKey] !== false;
}

// ライフプラン表の列表示を切り替えます。
function setTableColumnVisibility(columnKey, isVisible) {
  getTableColumnSettings()[columnKey] = Boolean(isVisible);
  saveUiState();
}

// ライフプラン表のコンパクト表示状態を取得します。
function isCompactLifePlanTable() {
  return Boolean(getUiState().compactLifePlanTable);
}

// ライフプラン表のコンパクト表示状態を保存します。
function setCompactLifePlanTable(isCompact) {
  getUiState().compactLifePlanTable = Boolean(isCompact);
  saveUiState();
}

// 金額内訳の1行を安全な形に整えます。
function createFinanceItem(id, name, amount, memo) {
  return {
    id: id,
    name: name,
    amount: toNumber(amount),
    memo: memo || ""
  };
}

// 保存済みの内訳配列を安全な形に整え、なければ移行用の初期行を使います。
function normalizeFinanceItems(items, fallbackItems) {
  const sourceItems = Array.isArray(items) ? items : fallbackItems;

  return (Array.isArray(sourceItems) ? sourceItems : [])
    .map(function (item, index) {
      if (!item || typeof item !== "object") {
        return null;
      }

      return createFinanceItem(
        item.id || createId("finance_item"),
        item.name || `項目${index + 1}`,
        item.amount,
        item.memo || ""
      );
    })
    .filter(Boolean);
}

// 金額内訳の合計を計算します。
function sumFinanceItems(items) {
  return (Array.isArray(items) ? items : []).reduce(function (total, item) {
    return total + toNumber(item && item.amount);
  }, 0);
}

// 指定名の内訳金額を取得します。
function getFinanceItemAmountByName(items, name) {
  const matchedItem = (Array.isArray(items) ? items : []).find(function (item) {
    return item && item.name === name;
  });

  return matchedItem ? toNumber(matchedItem.amount) : 0;
}

// 現金預金の旧データを口座別内訳へ移行します。
function getDefaultCashAccounts(assets) {
  return [
    createFinanceItem(
      "cash-legacy",
      "現金預金",
      hasValue(assets && assets.cash) ? assets.cash : 0,
      hasValue(assets && assets.cash) ? "旧データから移行" : ""
    )
  ];
}

// 投資資産の旧データを内訳へ移行します。
function getDefaultInvestmentItems(assets) {
  return [
    createFinanceItem("investment-japan-stock", "日本株式", 0, ""),
    createFinanceItem("investment-us-stock", "米国株式", 0, ""),
    createFinanceItem(
      "investment-fund",
      "投資信託",
      hasValue(assets && assets.investments) ? assets.investments : 0,
      hasValue(assets && assets.investments) ? "旧データの投資資産から移行" : ""
    )
  ];
}

// 毎月支出の旧データを項目別内訳へ移行します。
function getDefaultMonthlyExpenseItems(expenses) {
  return [
    createFinanceItem("monthly-mortgage", "住宅ローン", expenses && expenses.mortgageMonthly, ""),
    createFinanceItem("monthly-food", "食費", expenses && expenses.livingMonthly, hasValue(expenses && expenses.livingMonthly) ? "旧データの生活費から移行" : ""),
    createFinanceItem("monthly-communication", "通信費", 0, ""),
    createFinanceItem("monthly-utilities", "光熱費", 0, ""),
    createFinanceItem("monthly-insurance", "保険", expenses && expenses.insuranceMonthly, ""),
    createFinanceItem("monthly-education", "教育費", expenses && expenses.educationMonthly, ""),
    createFinanceItem("monthly-car", "車関連", expenses && expenses.carMonthly, ""),
    createFinanceItem(
      "monthly-other-fixed",
      "その他固定費",
      hasValue(expenses && expenses.otherFixedMonthly)
        ? expenses.otherFixedMonthly
        : hasValue(expenses && expenses.otherMonthly)
          ? expenses.otherMonthly
          : 0,
      ""
    )
  ];
}

// 毎年支出の初期項目を作ります。
function getDefaultAnnualExpenseItems() {
  return [
    createFinanceItem("annual-property-tax", "固都税", 0, ""),
    createFinanceItem("annual-car-tax", "自動車税", 0, "")
  ];
}

// 現金預金合計を取得します。
function calculateCashTotal(data) {
  const assets = data && data.assets ? data.assets : {};
  return Array.isArray(assets.cashAccounts) ? sumFinanceItems(assets.cashAccounts) : toNumber(assets.cash);
}

// 投資資産合計を取得します。
function calculateInvestmentTotal(data) {
  const assets = data && data.assets ? data.assets : {};
  return Array.isArray(assets.investmentItems) ? sumFinanceItems(assets.investmentItems) : toNumber(assets.investments);
}

// 毎月支出合計を取得します。
function calculateMonthlyExpenseTotal(data) {
  const expenses = data && data.expenses ? data.expenses : {};

  if (Array.isArray(expenses.monthlyItems)) {
    return sumFinanceItems(expenses.monthlyItems);
  }

  return (
    toNumber(expenses.livingMonthly) +
    toNumber(expenses.mortgageMonthly) +
    toNumber(expenses.insuranceMonthly) +
    toNumber(expenses.educationMonthly) +
    toNumber(expenses.carMonthly) +
    toNumber(expenses.otherFixedMonthly)
  );
}

// 毎年支出合計を取得します。
function calculateAnnualExpenseItemTotal(data) {
  const expenses = data && data.expenses ? data.expenses : {};
  return Array.isArray(expenses.annualItems) ? sumFinanceItems(expenses.annualItems) : 0;
}

// 内訳合計と旧フィールドを同期し、古い処理やJSONとの互換性を保ちます。
function syncLegacyFinanceFields(data) {
  if (!data || typeof data !== "object") {
    return data;
  }

  const assets = data.assets || {};
  const expenses = data.expenses || {};

  assets.cash = calculateCashTotal(data);
  assets.investments = calculateInvestmentTotal(data);
  expenses.mortgageMonthly = getFinanceItemAmountByName(expenses.monthlyItems, "住宅ローン");
  expenses.livingMonthly =
    getFinanceItemAmountByName(expenses.monthlyItems, "食費") +
    getFinanceItemAmountByName(expenses.monthlyItems, "通信費") +
    getFinanceItemAmountByName(expenses.monthlyItems, "光熱費");
  expenses.insuranceMonthly = getFinanceItemAmountByName(expenses.monthlyItems, "保険");
  expenses.educationMonthly = getFinanceItemAmountByName(expenses.monthlyItems, "教育費");
  expenses.carMonthly = getFinanceItemAmountByName(expenses.monthlyItems, "車関連");
  expenses.otherFixedMonthly = getFinanceItemAmountByName(expenses.monthlyItems, "その他固定費");

  data.assets = assets;
  data.expenses = expenses;
  return data;
}

// NISAの金額入力を0円以上の整数へそろえます。
function normalizeNisaAmount(value) {
  const amount = Math.trunc(toNumber(value));
  return amount >= 0 ? amount : 0;
}

// 家族設定からNISA管理枠の初期対象者を探します。
function findDefaultNisaFamilyMemberId(family, memberIndex) {
  const members = Array.isArray(family) ? family : [];
  const relationshipPattern = memberIndex === 0
    ? /^本人$/
    : /^(配偶者|妻|夫)$/;
  const matchedMember = members.find(function (member) {
    return relationshipPattern.test(String(member && member.relationship || "").trim());
  });

  return matchedMember && matchedMember.id ? matchedMember.id : "";
}

// NISA年次記録を保存可能な形へ整えます。
function normalizeNisaRecord(record, memberIndex, recordIndex) {
  const source = record && typeof record === "object" ? record : {};
  const year = Math.trunc(toNumber(source.year));

  return {
    id: hasValue(source.id)
      ? String(source.id)
      : `nisa-record-${memberIndex + 1}-${year || recordIndex + 1}`,
    year: year,
    tsumitatePurchaseAmount: normalizeNisaAmount(source.tsumitatePurchaseAmount),
    growthPurchaseAmount: normalizeNisaAmount(source.growthPurchaseAmount),
    tsumitateSoldBookValue: normalizeNisaAmount(source.tsumitateSoldBookValue),
    growthSoldBookValue: normalizeNisaAmount(source.growthSoldBookValue),
    memo: hasValue(source.memo) ? String(source.memo) : ""
  };
}

// 同一年の重複を除き、NISA年次記録を年順にそろえます。
function normalizeNisaRecords(records, memberIndex) {
  const normalizedRecords = [];
  const usedYears = new Set();

  (Array.isArray(records) ? records : [])
    .map(function (record, recordIndex) {
      return normalizeNisaRecord(record, memberIndex, recordIndex);
    })
    .filter(function (record) {
      return record.year >= NISA_RULES.startYear;
    })
    .sort(function (firstRecord, secondRecord) {
      return firstRecord.year - secondRecord.year;
    })
    .forEach(function (record) {
      if (!usedYears.has(record.year)) {
        usedYears.add(record.year);
        normalizedRecords.push(record);
      }
    });

  return normalizedRecords;
}

// 1人分のNISA管理データを補完します。
function normalizeNisaMember(member, memberIndex, family) {
  const source = member && typeof member === "object" ? member : {};
  const fallbackName = memberIndex === 0 ? "本人" : "配偶者";
  const defaultFamilyMemberId = findDefaultNisaFamilyMemberId(family, memberIndex);

  return {
    id: hasValue(source.id) ? String(source.id) : `nisa-member-${memberIndex + 1}`,
    familyMemberId: hasValue(source.familyMemberId)
      ? String(source.familyMemberId)
      : defaultFamilyMemberId,
    fallbackName: hasValue(source.fallbackName) ? String(source.fallbackName) : fallbackName,
    records: normalizeNisaRecords(source.records, memberIndex)
  };
}

// 旧データへ本人・配偶者の2人分のNISA管理構造を安全に追加します。
function ensureNisaManagementShape(data) {
  const family = Array.isArray(data && data.family) ? data.family : [];
  const source = data && data.nisaManagement && typeof data.nisaManagement === "object"
    ? data.nisaManagement
    : {};
  const sourceMembers = Array.isArray(source.members) ? source.members : [];
  const members = [0, 1].map(function (memberIndex) {
    return normalizeNisaMember(sourceMembers[memberIndex], memberIndex, family);
  });

  // 初回自動選択でも同じ家族を2枠へ割り当てません。
  if (
    members[0].familyMemberId &&
    members[0].familyMemberId === members[1].familyMemberId
  ) {
    members[1].familyMemberId = "";
  }

  data.nisaManagement = {
    startYear: NISA_RULES.startYear,
    members: members
  };

  return data;
}

// 古い保存データに足りない項目を補完します。
function ensureDataShape(data) {
  const shapedData = data && typeof data === "object" && !Array.isArray(data) ? data : {};

  if (!shapedData.settings || typeof shapedData.settings !== "object") {
    shapedData.settings = {
      startYear: 2026,
      endYear: 2056
    };
  }

  shapedData.settings.startYear = hasValue(shapedData.settings.startYear)
    ? Math.trunc(toNumber(shapedData.settings.startYear))
    : 2026;
  shapedData.settings.endYear = hasValue(shapedData.settings.endYear)
    ? Math.trunc(toNumber(shapedData.settings.endYear))
    : 2056;

  if (!shapedData.settings.startYear) {
    shapedData.settings.startYear = 2026;
  }

  if (!shapedData.settings.endYear || shapedData.settings.endYear < shapedData.settings.startYear) {
    shapedData.settings.endYear = shapedData.settings.startYear;
  }

  shapedData.settings.baseYear = hasValue(shapedData.settings.baseYear)
    ? Math.trunc(toNumber(shapedData.settings.baseYear))
    : shapedData.settings.startYear;

  if (!shapedData.settings.baseYear) {
    shapedData.settings.baseYear = shapedData.settings.startYear;
  }

  if (!hasValue(shapedData.settings.memo)) {
    shapedData.settings.memo = "";
  }

  if (!Array.isArray(shapedData.family)) {
    shapedData.family = [];
  }

  if (!Array.isArray(shapedData.events)) {
    shapedData.events = [];
  }

  if (!shapedData.assets || typeof shapedData.assets !== "object") {
    shapedData.assets = {};
  }

  if (!shapedData.income || typeof shapedData.income !== "object") {
    shapedData.income = {};
  }

  if (!shapedData.expenses || typeof shapedData.expenses !== "object") {
    shapedData.expenses = {};
  }

  if (!shapedData.mortgage || typeof shapedData.mortgage !== "object") {
    shapedData.mortgage = {};
  }

  shapedData.assets.cashAccounts = normalizeFinanceItems(
    shapedData.assets.cashAccounts,
    getDefaultCashAccounts(shapedData.assets)
  );
  shapedData.assets.investmentItems = normalizeFinanceItems(
    shapedData.assets.investmentItems,
    getDefaultInvestmentItems(shapedData.assets)
  );
  shapedData.expenses.monthlyItems = normalizeFinanceItems(
    shapedData.expenses.monthlyItems,
    getDefaultMonthlyExpenseItems(shapedData.expenses)
  );
  shapedData.expenses.annualItems = normalizeFinanceItems(
    shapedData.expenses.annualItems,
    getDefaultAnnualExpenseItems()
  );
  syncLegacyFinanceFields(shapedData);

  if (!hasValue(shapedData.mortgage.currentBalance)) {
    shapedData.mortgage.currentBalance = hasValue(shapedData.assets.liabilities)
      ? toNumber(shapedData.assets.liabilities)
      : 25000000;
  }

  if (!hasValue(shapedData.mortgage.annualInterestRate)) {
    shapedData.mortgage.annualInterestRate = 0.97;
  }

  if (!hasValue(shapedData.mortgage.monthlyPayment)) {
    shapedData.mortgage.monthlyPayment = hasValue(shapedData.expenses.mortgageMonthly)
      ? toNumber(shapedData.expenses.mortgageMonthly)
      : 80000;
  }

  if (!shapedData.dollarInsurance || typeof shapedData.dollarInsurance !== "object") {
    shapedData.dollarInsurance = {};
  }

  if (typeof shapedData.dollarInsurance.enabled !== "boolean") {
    shapedData.dollarInsurance.enabled = true;
  }

  if (!hasValue(shapedData.dollarInsurance.policyName)) {
    shapedData.dollarInsurance.policyName = "米国ドル建終身保険";
  }

  if (!hasValue(shapedData.dollarInsurance.targetFamilyMemberId)) {
    shapedData.dollarInsurance.targetFamilyMemberId = "";
  }

  if (!hasValue(shapedData.dollarInsurance.exchangeRate)) {
    shapedData.dollarInsurance.exchangeRate = 150;
  } else {
    shapedData.dollarInsurance.exchangeRate = toNumber(shapedData.dollarInsurance.exchangeRate);
  }

  if (!hasValue(shapedData.dollarInsurance.memo)) {
    shapedData.dollarInsurance.memo = "";
  }

  if (!hasValue(shapedData.dollarInsurance.scheduleText)) {
    shapedData.dollarInsurance.scheduleText = "";
  }

  if (Array.isArray(shapedData.dollarInsurance.schedule)) {
    shapedData.dollarInsurance.schedule = normalizeDollarInsuranceSchedule(shapedData.dollarInsurance.schedule);
  } else {
    shapedData.dollarInsurance.schedule = [];
  }

  if (shapedData.dollarInsurance.schedule.length === 0 && shapedData.dollarInsurance.scheduleText) {
    shapedData.dollarInsurance.schedule = parseDollarInsuranceScheduleText(shapedData.dollarInsurance.scheduleText);
  }

  ensureNisaManagementShape(shapedData);
  syncLegacyFinanceFields(shapedData);
  return shapedData;
}

// id から DOM 要素を安全に取得します。
function getElement(id) {
  try {
    return document.getElementById(id);
  } catch (error) {
    console.warn(`要素の取得に失敗しました: ${id}`, error);
    return null;
  }
}

// 要素の中身を空にします。
function clearElement(element) {
  if (!element) {
    return;
  }

  element.innerHTML = "";
}

// テキストを持つ DOM 要素を作ります。
function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  element.textContent = text;
  return element;
}

// 折りたたみ対象の主要セクション定義です。
function getCollapsibleSectionConfigs() {
  return [
    { key: "dashboard", sectionId: "dashboard-section", headingId: "dashboard-heading" },
    { key: "calculationSettings", sectionId: "calculation-settings-section", headingId: "calculation-settings-heading" },
    { key: "family", sectionId: "family-section", headingId: "family-heading" },
    { key: "events", sectionId: "event-section", headingId: "event-heading" },
    { key: "finance", sectionId: "finance-section", headingId: "finance-heading" },
    { key: "nisa", sectionId: "nisa-section", headingId: "nisa-heading" },
    { key: "dollarInsurance", sectionId: "dollar-insurance-section", headingId: "dollar-insurance-heading" },
    { key: "chart", sectionId: "asset-chart-section", headingId: "asset-chart-heading" },
    { key: "table", sectionId: "life-plan-section", headingId: "life-plan-heading" },
    { key: "dataManagement", sectionId: "data-management-section", headingId: "data-management-heading" }
  ];
}

// フォーム折りたたみボタンの表示設定です。
function getFormPanelConfig(formKey) {
  const configs = {
    familyForm: {
      buttonId: "family-form-toggle-button",
      panelId: "family-form-panel",
      openLabel: "入力欄を開く",
      closeLabel: "入力欄を閉じる"
    },
    eventForm: {
      buttonId: "event-form-toggle-button",
      panelId: "event-form-panel",
      openLabel: "入力欄を開く",
      closeLabel: "入力欄を閉じる"
    },
    financeForm: {
      buttonId: "finance-form-toggle-button",
      panelId: "finance-form-panel",
      openLabel: "入力欄を開く",
      closeLabel: "入力欄を閉じる"
    },
    dollarInsuranceForm: {
      buttonId: "dollar-insurance-form-toggle-button",
      panelId: "dollar-insurance-form-panel",
      openLabel: "終身保険入力欄を開く",
      closeLabel: "終身保険入力欄を閉じる"
    },
    backupText: {
      buttonId: "backup-text-toggle-button",
      panelId: "backup-text-panel",
      openLabel: "バックアップ文字列欄を開く",
      closeLabel: "バックアップ文字列欄を閉じる"
    }
  };

  return configs[formKey] || null;
}

// セクションの開閉状態を反映します。
function applySectionState(config) {
  const section = getElement(config.sectionId);
  const content = getElement(`${config.sectionId}-content`);
  const toggleButton = getElement(`${config.sectionId}-toggle-button`);
  const isCollapsed = isSectionCollapsed(config.key);

  if (!section || !content || !toggleButton) {
    return;
  }

  section.classList.toggle("is-collapsed", isCollapsed);
  content.hidden = isCollapsed;
  toggleButton.textContent = isCollapsed ? "開く" : "閉じる";
  toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
  toggleButton.setAttribute("aria-controls", content.id);
}

// セクションの開閉ボタンと中身ラッパーを用意します。
function setupCollapsibleSections() {
  getCollapsibleSectionConfigs().forEach(function (config) {
    const section = getElement(config.sectionId);
    const heading = getElement(config.headingId);

    if (!section || !heading) {
      return;
    }

    let header = getElement(`${config.sectionId}-collapsible-header`);
    let content = getElement(`${config.sectionId}-content`);
    let toggleButton = getElement(`${config.sectionId}-toggle-button`);

    if (!header) {
      header = document.createElement("div");
      header.id = `${config.sectionId}-collapsible-header`;
      header.className = "collapsible-header";
      section.insertBefore(header, heading);
      header.appendChild(heading);
    }

    if (!toggleButton) {
      toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.id = `${config.sectionId}-toggle-button`;
      toggleButton.className = "section-toggle-button";
      header.appendChild(toggleButton);
    }

    toggleButton.onclick = function () {
      setSectionCollapsed(config.key, !isSectionCollapsed(config.key));
      applySectionState(config);
    };

    if (!content) {
      content = document.createElement("div");
      content.id = `${config.sectionId}-content`;
      content.className = "collapsible-content";
      section.appendChild(content);

      Array.prototype.slice.call(section.childNodes).forEach(function (node) {
        if (node !== header && node !== content) {
          content.appendChild(node);
        }
      });
    }

    applySectionState(config);
  });
}

// フォームパネルの開閉状態を画面に反映します。
function applyFormPanelState(formKey) {
  const config = getFormPanelConfig(formKey);

  if (!config) {
    return;
  }

  const panel = getElement(config.panelId);
  const toggleButton = getElement(config.buttonId);
  const isCollapsed = isFormCollapsed(formKey);

  if (!panel || !toggleButton) {
    return;
  }

  panel.hidden = isCollapsed;
  panel.classList.toggle("is-collapsed", isCollapsed);
  toggleButton.textContent = isCollapsed ? config.openLabel : config.closeLabel;
  toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
  toggleButton.setAttribute("aria-controls", config.panelId);
}

// フォームパネルの開閉を切り替えます。
function toggleFormPanel(formKey) {
  setFormCollapsed(formKey, !isFormCollapsed(formKey));
  applyFormPanelState(formKey);
}

// フォームパネルを開きます。
function openFormPanel(formKey) {
  setFormCollapsed(formKey, false);
  applyFormPanelState(formKey);
}

// フォームの前に開閉ボタンを置き、入力欄本体をパネル化します。
function createFormPanel(container, formKey) {
  const config = getFormPanelConfig(formKey);
  const toggleButton = document.createElement("button");
  const panel = document.createElement("div");

  toggleButton.type = "button";
  toggleButton.id = config.buttonId;
  toggleButton.className = "form-toggle-button secondary-button";
  toggleButton.addEventListener("click", function () {
    toggleFormPanel(formKey);
  });

  panel.id = config.panelId;
  panel.className = "form-panel";

  container.appendChild(toggleButton);
  container.appendChild(panel);
  applyFormPanelState(formKey);
  return panel;
}

// negative クラスの付け外しをまとめます。
function setNegativeClass(element, isNegative) {
  if (!element || !element.classList) {
    return;
  }

  if (isNegative) {
    element.classList.add("negative");
  } else {
    element.classList.remove("negative");
  }
}

// id を指定してテキストを更新します。
function setElementText(id, text, isNegative) {
  const element = getElement(id);

  if (!element) {
    return;
  }

  element.textContent = text;
  setNegativeClass(element, Boolean(isNegative));
}

// ダッシュボード内のカード配置先を取得します。
function getDashboardGrid() {
  const dashboardSection = getElement("dashboard-section");

  if (!dashboardSection || typeof dashboardSection.querySelector !== "function") {
    return null;
  }

  return dashboardSection.querySelector(".dashboard-grid");
}

// ダッシュボードに後から追加するカードを用意します。
function ensureDashboardCard(valueId, label) {
  if (getElement(valueId)) {
    return;
  }

  const dashboardGrid = getDashboardGrid();

  if (!dashboardGrid) {
    return;
  }

  const card = document.createElement("article");
  const title = document.createElement("h3");
  const value = document.createElement("p");

  card.className = "dashboard-card";
  title.textContent = label;
  value.id = valueId;
  value.textContent = "-";

  card.appendChild(title);
  card.appendChild(value);
  dashboardGrid.appendChild(card);
}

// localStorage から保存済みデータを読み込みます。
function loadData() {
  try {
    const savedData = localStorage.getItem(getStorageKey());

    if (!savedData) {
      return getInitialDataCopy();
    }

    return ensureDataShape(JSON.parse(savedData) || getInitialDataCopy());
  } catch (error) {
    console.warn("データの読み込みに失敗しました。初期データを使用します。", error);
    return getInitialDataCopy();
  }
}

// 現在のデータを localStorage に保存します。
function saveData() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(lifePlanData));
    showMessage("保存しました", "success");
    return true;
  } catch (error) {
    console.warn("データの保存に失敗しました。", error);
    showMessage("保存に失敗しました", "error");
    return false;
  }
}

// 初期データに戻し、計算結果も作り直します。
function resetData() {
  const shouldReset = confirm("初期データに戻します。よろしいですか？");

  if (!shouldReset) {
    return;
  }

  lifePlanData = ensureDataShape(getInitialDataCopy());
  editingEventId = null;
  editingFamilyId = null;
  editingNisaRecordIds = {};
  lifePlanResults = calculateLifePlan(lifePlanData);

  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(lifePlanData));
    renderAll();
    showMessage("初期データに戻しました", "success");
  } catch (error) {
    console.warn("初期データの保存に失敗しました。", error);
    renderAll();
    showMessage("初期データに戻しましたが、保存に失敗しました", "error");
  }
}

// 画面下部のメッセージ欄に結果を表示します。
function showMessage(message, type) {
  const messageArea = getElement("app-message");

  if (!messageArea) {
    return;
  }

  if (messageTimerId) {
    clearTimeout(messageTimerId);
  }

  messageArea.textContent = message;
  messageArea.classList.remove("message-success", "message-error");

  if (type === "success") {
    messageArea.classList.add("message-success");
  }

  if (type === "error") {
    messageArea.classList.add("message-error");
  }

  messageTimerId = setTimeout(function () {
    messageArea.textContent = "";
    messageArea.classList.remove("message-success", "message-error");
  }, 4000);
}

// 値を数値に変換し、変換できない場合は 0 にします。
function toNumber(value) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

// 金額をカンマ区切りの円表示にします。
function formatYen(value) {
  return `${toNumber(value).toLocaleString("ja-JP")}円`;
}

// コンパクト表示用に円を万円単位へ短縮します。
function formatCompactYen(value) {
  const numberValue = toNumber(value);
  const absoluteValue = Math.abs(numberValue);

  if (numberValue === 0) {
    return "0";
  }

  if (absoluteValue >= 10000) {
    const compactValue = Math.round(numberValue / 10000);
    return `${compactValue.toLocaleString("ja-JP")}万円`;
  }

  return `${numberValue.toLocaleString("ja-JP")}円`;
}

// ライフプラン表用に通常表示とコンパクト表示を切り替えます。
function formatYenForTable(value) {
  return isCompactLifePlanTable() ? formatCompactYen(value) : formatYen(value);
}

// 米ドル金額を読みやすく表示します。
function formatUsd(value) {
  return `${toNumber(value).toLocaleString("ja-JP", {
    maximumFractionDigits: 2
  })} USD`;
}

// ライフプラン表用のUSD表示です。
function formatUsdForTable(value) {
  return isCompactLifePlanTable()
    ? Math.round(toNumber(value)).toLocaleString("ja-JP")
    : formatUsd(value);
}

// パーセント値を読みやすく表示します。
function formatPercent(value) {
  return `${toNumber(value).toLocaleString("ja-JP", {
    maximumFractionDigits: 2
  })}%`;
}

// 生年月日文字列の先頭4桁から生年を取得します。
function getBirthYear(birthDate) {
  const birthYear = Number(String(birthDate || "").slice(0, 4));
  return Number.isNaN(birthYear) ? null : birthYear;
}

// 指定年時点の年齢を簡易計算します。
function calculateAgeInYear(birthDate, year) {
  const birthYear = getBirthYear(birthDate);

  if (birthYear === null) {
    return null;
  }

  return toNumber(year) - birthYear;
}

// null、undefined、空文字以外を入力ありとして扱います。
function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

// USD、%、円、空白などを取り除き、数値だけを取り出します。
function parseFlexibleNumber(value) {
  const cleanedText = String(value || "")
    .replace(/USD/gi, "")
    .replace(/米ドル/g, "")
    .replace(/USドル/g, "")
    .replace(/[,$￥円%]/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d.-]/g, "");

  if (!/\d/.test(cleanedText)) {
    return Number.NaN;
  }

  return Number(cleanedText);
}

// 変換できない場合は0として扱います。
function parseFlexibleNumberOrZero(value) {
  const parsedValue = parseFlexibleNumber(value);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

// カンマ区切りで数値の桁区切りが混ざった行を、8列に近づけて分割します。
function splitDollarInsuranceCsvLine(line) {
  if (line.includes("\t")) {
    return line.split("\t");
  }

  const tokens = line.split(",");

  if (tokens.length <= 8) {
    return tokens;
  }

  const fields = [tokens[0] || "", tokens[1] || ""];
  let index = 2;

  while (fields.length < 7 && index < tokens.length) {
    let fieldText = tokens[index] || "";
    index += 1;

    while (
      index < tokens.length &&
      !fieldText.includes(".") &&
      /^\s*\d{3}(?:\.\d+)?(?:\s*(?:USD|米ドル|USドル|円|%)?)?\s*$/i.test(tokens[index] || "")
    ) {
      fieldText = `${fieldText},${tokens[index]}`;
      index += 1;
    }

    fields.push(fieldText);
  }

  fields.push(tokens.slice(index).join(","));
  return fields;
}

// CSV風テキストの1行をドル建終身保険の行データへ変換します。
function parseDollarInsuranceScheduleLine(line) {
  const columns = splitDollarInsuranceCsvLine(line).map(function (column) {
    return String(column || "").trim();
  });
  const policyYear = parseFlexibleNumber(columns[0]);
  const age = parseFlexibleNumber(columns[1]);

  if (Number.isNaN(policyYear) || Number.isNaN(age)) {
    return null;
  }

  return {
    policyYear: Math.trunc(policyYear),
    age: Math.trunc(age),
    cumulativePremiumUsd: parseFlexibleNumberOrZero(columns[2]),
    deathBenefitUsd: parseFlexibleNumberOrZero(columns[3]),
    cashValueUsd: parseFlexibleNumberOrZero(columns[4]),
    returnRate: parseFlexibleNumberOrZero(columns[5]),
    reducedPaidUpInsuranceUsd: parseFlexibleNumberOrZero(columns[6]),
    elapsedPeriod: columns[7] || ""
  };
}

// CSV風テキスト全体を解約返戻金推移データへ変換します。
function parseDollarInsuranceScheduleText(scheduleText) {
  return String(scheduleText || "")
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean)
    .map(parseDollarInsuranceScheduleLine)
    .filter(Boolean);
}

// JSONから読み込んだ解約返戻金配列を安全な形に整えます。
function normalizeDollarInsuranceSchedule(schedule) {
  return (Array.isArray(schedule) ? schedule : [])
    .map(function (row) {
      if (!row || typeof row !== "object") {
        return null;
      }

      return {
        policyYear: Math.trunc(toNumber(row.policyYear)),
        age: Math.trunc(toNumber(row.age)),
        cumulativePremiumUsd: toNumber(row.cumulativePremiumUsd),
        deathBenefitUsd: toNumber(row.deathBenefitUsd),
        cashValueUsd: toNumber(row.cashValueUsd),
        returnRate: toNumber(row.returnRate),
        reducedPaidUpInsuranceUsd: toNumber(row.reducedPaidUpInsuranceUsd),
        elapsedPeriod: String(row.elapsedPeriod || "")
      };
    })
    .filter(function (row) {
      return row && row.policyYear > 0 && row.age > 0;
    });
}

// 対象者の年齢に一致するドル建終身保険の行を探します。
function findDollarInsuranceRowByAge(data, age) {
  const insurance = data && data.dollarInsurance ? data.dollarInsurance : {};
  const schedule = Array.isArray(insurance.schedule) ? insurance.schedule : [];
  const targetAge = Math.trunc(toNumber(age));

  return schedule.find(function (row) {
    return Math.trunc(toNumber(row.age)) === targetAge;
  }) || null;
}

// 指定年のライフプラン表用に、ドル建終身保険の参考額を取得します。
function getDollarInsuranceReferenceForYear(data, year) {
  const insurance = data && data.dollarInsurance ? data.dollarInsurance : {};
  const family = Array.isArray(data && data.family) ? data.family : [];
  const targetFamily = family.find(function (member) {
    return member.id === insurance.targetFamilyMemberId;
  });

  if (!insurance.enabled || !targetFamily) {
    return {
      dollarInsuranceCumulativePremiumUsd: 0,
      dollarInsuranceCumulativePremiumJpy: 0,
      dollarInsuranceCashValueUsd: 0,
      dollarInsuranceCashValueJpy: 0,
      dollarInsuranceReturnRate: 0
    };
  }

  const targetAge = calculateAgeInYear(targetFamily.birthDate, year);
  const matchedRow = targetAge === null ? null : findDollarInsuranceRowByAge(data, targetAge);
  const cumulativePremiumUsd = matchedRow ? toNumber(matchedRow.cumulativePremiumUsd) : 0;
  const cashValueUsd = matchedRow ? toNumber(matchedRow.cashValueUsd) : 0;
  const exchangeRate = toNumber(insurance.exchangeRate);

  return {
    dollarInsuranceCumulativePremiumUsd: cumulativePremiumUsd,
    dollarInsuranceCumulativePremiumJpy: cumulativePremiumUsd * exchangeRate,
    dollarInsuranceCashValueUsd: cashValueUsd,
    dollarInsuranceCashValueJpy: cashValueUsd * exchangeRate,
    dollarInsuranceReturnRate: matchedRow ? toNumber(matchedRow.returnRate) : 0
  };
}

// イベントが発生する年を計算します。
function getEventYear(event, data) {
  if (hasValue(event.scheduledYear)) {
    return toNumber(event.scheduledYear);
  }

  if (hasValue(event.targetAge) && event.targetFamilyId) {
    const family = Array.isArray(data.family) ? data.family : [];
    const targetFamily = family.find(function (member) {
      return member.id === event.targetFamilyId;
    });

    if (!targetFamily) {
      return null;
    }

    const birthYear = getBirthYear(targetFamily.birthDate);

    if (birthYear === null) {
      return null;
    }

    return birthYear + toNumber(event.targetAge);
  }

  return null;
}

// 現在総資産を計算します。
function calculateTotalAssets(data) {
  const assets = data.assets || {};

  return (
    calculateCashTotal(data) +
    calculateInvestmentTotal(data) +
    toNumber(assets.insurance) +
    toNumber(assets.otherAssets)
  );
}

// 現在純資産を計算します。
function calculateNetAssets(data) {
  const assets = data.assets || {};
  return calculateTotalAssets(data) - toNumber(assets.liabilities);
}

// 年間収入を計算します。
function calculateAnnualIncome(data, year) {
  const income = data.income || {};
  const baseIncome =
    toNumber(income.salary) +
    toNumber(income.bonus) +
    toNumber(income.allowance) +
    toNumber(income.otherIncome);

  // 今後ここで年ごとの収入増減を反映します。
  return baseIncome;
}

// 通常の年間支出を計算します。
function calculateAnnualRegularExpenses(data) {
  return calculateMonthlyExpenseTotal(data) * 12 + calculateAnnualExpenseItemTotal(data);
}

// 1人分のNISA枠を年順に計算します。DOMには依存しません。
function calculateNisaMemberSchedule(memberRecords, rules) {
  const appliedRules = rules || NISA_RULES;
  const records = normalizeNisaRecords(memberRecords, 0);
  let tsumitateBookValue = 0;
  let growthBookValue = 0;

  return records.map(function (record) {
    const startTsumitateBookValue = tsumitateBookValue;
    const startGrowthBookValue = growthBookValue;
    const startTotalBookValue = startTsumitateBookValue + startGrowthBookValue;
    const purchaseTotal =
      record.tsumitatePurchaseAmount +
      record.growthPurchaseAmount;
    const soldBookValueTotal =
      record.tsumitateSoldBookValue +
      record.growthSoldBookValue;
    const endTsumitateBookValue =
      startTsumitateBookValue +
      record.tsumitatePurchaseAmount -
      record.tsumitateSoldBookValue;
    const endGrowthBookValue =
      startGrowthBookValue +
      record.growthPurchaseAmount -
      record.growthSoldBookValue;
    const endTotalBookValue = endTsumitateBookValue + endGrowthBookValue;

    tsumitateBookValue = endTsumitateBookValue;
    growthBookValue = endGrowthBookValue;

    return {
      id: record.id,
      year: record.year,
      memo: record.memo,
      tsumitatePurchaseAmount: record.tsumitatePurchaseAmount,
      growthPurchaseAmount: record.growthPurchaseAmount,
      purchaseTotal: purchaseTotal,
      tsumitateSoldBookValue: record.tsumitateSoldBookValue,
      growthSoldBookValue: record.growthSoldBookValue,
      soldBookValueTotal: soldBookValueTotal,
      startTsumitateBookValue: startTsumitateBookValue,
      startGrowthBookValue: startGrowthBookValue,
      startTotalBookValue: startTotalBookValue,
      annualTsumitateRemaining: appliedRules.annualTsumitateLimit - record.tsumitatePurchaseAmount,
      annualGrowthRemaining: appliedRules.annualGrowthLimit - record.growthPurchaseAmount,
      annualTotalRemaining: appliedRules.annualTotalLimit - purchaseTotal,
      lifetimeTotalRemainingAtStart: appliedRules.lifetimeTotalLimit - startTotalBookValue,
      lifetimeGrowthRemainingAtStart: appliedRules.lifetimeGrowthLimit - startGrowthBookValue,
      endTsumitateBookValue: endTsumitateBookValue,
      endGrowthBookValue: endGrowthBookValue,
      endTotalBookValue: endTotalBookValue,
      nextYearRestorationAmount: soldBookValueTotal,
      nextYearLifetimeTotalRemaining: appliedRules.lifetimeTotalLimit - endTotalBookValue,
      nextYearLifetimeGrowthRemaining: appliedRules.lifetimeGrowthLimit - endGrowthBookValue
    };
  });
}

// NISA年次記録全体を順に検証し、過去年の編集も後続年へ反映します。
function validateNisaMemberRecords(memberRecords, rules) {
  const appliedRules = rules || NISA_RULES;
  const records = Array.isArray(memberRecords) ? memberRecords.slice() : [];
  const usedYears = new Set();
  let startTsumitateBookValue = 0;
  let startGrowthBookValue = 0;

  records.sort(function (firstRecord, secondRecord) {
    return toNumber(firstRecord && firstRecord.year) - toNumber(secondRecord && secondRecord.year);
  });

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] || {};
    const year = toNumber(record.year);
    const amounts = [
      toNumber(record.tsumitatePurchaseAmount),
      toNumber(record.growthPurchaseAmount),
      toNumber(record.tsumitateSoldBookValue),
      toNumber(record.growthSoldBookValue)
    ];

    if (!Number.isInteger(year) || year < appliedRules.startYear) {
      return {
        isValid: false,
        message: `年は${appliedRules.startYear}年以降の整数で入力してください`
      };
    }

    if (usedYears.has(year)) {
      return {
        isValid: false,
        message: `${year}年の記録はすでにあります`
      };
    }
    usedYears.add(year);

    if (amounts.some(function (amount) {
      return !Number.isInteger(amount) || amount < 0;
    })) {
      return {
        isValid: false,
        message: `${year}年の金額は0円以上の整数で入力してください`
      };
    }

    const tsumitatePurchaseAmount = amounts[0];
    const growthPurchaseAmount = amounts[1];
    const tsumitateSoldBookValue = amounts[2];
    const growthSoldBookValue = amounts[3];
    const purchaseTotal = tsumitatePurchaseAmount + growthPurchaseAmount;
    const startTotalBookValue = startTsumitateBookValue + startGrowthBookValue;
    const lifetimeTotalRemainingAtStart =
      appliedRules.lifetimeTotalLimit - startTotalBookValue;
    const lifetimeGrowthRemainingAtStart =
      appliedRules.lifetimeGrowthLimit - startGrowthBookValue;

    if (tsumitatePurchaseAmount > appliedRules.annualTsumitateLimit) {
      return {
        isValid: false,
        message: `${year}年のつみたて買付額は年間120万円以下にしてください`
      };
    }

    if (growthPurchaseAmount > appliedRules.annualGrowthLimit) {
      return {
        isValid: false,
        message: `${year}年の成長買付額は年間240万円以下にしてください`
      };
    }

    if (purchaseTotal > appliedRules.annualTotalLimit) {
      return {
        isValid: false,
        message: `${year}年の買付合計は年間360万円以下にしてください`
      };
    }

    if (purchaseTotal > lifetimeTotalRemainingAtStart) {
      return {
        isValid: false,
        message: `${year}年の買付合計が年初の生涯総枠残りを超えています`
      };
    }

    if (growthPurchaseAmount > lifetimeGrowthRemainingAtStart) {
      return {
        isValid: false,
        message: `${year}年の成長買付額が年初の成長投資枠残りを超えています`
      };
    }

    if (
      tsumitateSoldBookValue >
      startTsumitateBookValue + tsumitatePurchaseAmount
    ) {
      return {
        isValid: false,
        message: `${year}年のつみたて売却簿価が保有簿価を超えています`
      };
    }

    if (
      growthSoldBookValue >
      startGrowthBookValue + growthPurchaseAmount
    ) {
      return {
        isValid: false,
        message: `${year}年の成長売却簿価が保有簿価を超えています`
      };
    }

    startTsumitateBookValue =
      startTsumitateBookValue +
      tsumitatePurchaseAmount -
      tsumitateSoldBookValue;
    startGrowthBookValue =
      startGrowthBookValue +
      growthPurchaseAmount -
      growthSoldBookValue;

    if (startTsumitateBookValue < 0 || startGrowthBookValue < 0) {
      return {
        isValid: false,
        message: `${year}年末のNISA簿価残高がマイナスになります`
      };
    }
  }

  return {
    isValid: true,
    message: "",
    schedule: calculateNisaMemberSchedule(records, appliedRules)
  };
}

// 住宅ローン残高の年ごとの概算推移を計算します。
function calculateMortgageSchedule(data) {
  if (!data || !data.settings) {
    return [];
  }

  const shapedData = ensureDataShape(data);
  const startYear = Math.trunc(toNumber(shapedData.settings.startYear));
  const endYear = Math.trunc(toNumber(shapedData.settings.endYear));
  const baseYear = Math.trunc(toNumber(shapedData.settings.baseYear)) || startYear;
  const projectionStartYear = Math.min(baseYear, startYear);

  if (!startYear || !endYear || endYear < startYear) {
    return [];
  }

  const mortgage = shapedData.mortgage || {};
  const monthlyInterestRate = toNumber(mortgage.annualInterestRate) / 100 / 12;
  const monthlyPayment = Math.max(toNumber(mortgage.monthlyPayment), 0);
  const schedule = [];
  let balance = Math.max(toNumber(mortgage.currentBalance), 0);

  for (let year = projectionStartYear; year <= endYear; year += 1) {
    const mortgageStartBalance = balance;
    let mortgageAnnualPrincipal = 0;
    let mortgageAnnualInterest = 0;

    for (let month = 0; month < 12; month += 1) {
      if (balance <= 0) {
        balance = 0;
        break;
      }

      const monthlyInterest = balance * monthlyInterestRate;
      const principalPayment = Math.max(monthlyPayment - monthlyInterest, 0);
      const actualPrincipalPayment = Math.min(principalPayment, balance);

      mortgageAnnualInterest += monthlyInterest;
      mortgageAnnualPrincipal += actualPrincipalPayment;
      balance = Math.max(balance - actualPrincipalPayment, 0);
    }

    schedule.push({
      year: year,
      mortgageStartBalance: Math.round(mortgageStartBalance),
      mortgageEndBalance: Math.round(balance),
      mortgageAnnualPrincipal: Math.round(mortgageAnnualPrincipal),
      mortgageAnnualInterest: Math.round(mortgageAnnualInterest)
    });
  }

  return schedule;
}

// 年ごとのライフプラン結果を計算します。
function calculateLifePlan(data) {
  if (!data || !data.settings) {
    return [];
  }

  const startYear = Math.trunc(toNumber(data.settings.startYear));
  const endYear = Math.trunc(toNumber(data.settings.endYear));
  const baseYear = Math.trunc(toNumber(data.settings.baseYear)) || startYear;
  const projectionStartYear = Math.min(baseYear, startYear);

  if (!startYear || !endYear || endYear < startYear) {
    return [];
  }

  const family = Array.isArray(data.family) ? data.family : [];
  const events = Array.isArray(data.events) ? data.events : [];
  const mortgageSchedule = calculateMortgageSchedule(data);
  const results = [];
  let startAssets = calculateTotalAssets(data);

  for (let year = projectionStartYear; year <= endYear; year += 1) {
    const familyAges = family.map(function (member) {
      return {
        id: member.id,
        name: member.name,
        age: calculateAgeInYear(member.birthDate, year)
      };
    });

    const yearEvents = events.filter(function (event) {
      return getEventYear(event, data) === year;
    });

    const eventExpenseTotal = yearEvents.reduce(function (total, event) {
      return total + toNumber(event.amount);
    }, 0);

    const annualIncome = calculateAnnualIncome(data, year);
    const regularExpenses = calculateAnnualRegularExpenses(data);
    const totalExpenses = regularExpenses + eventExpenseTotal;
    const annualBalance = annualIncome - totalExpenses;
    const endAssets = startAssets + annualBalance;
    const dollarInsuranceReference = getDollarInsuranceReferenceForYear(data, year);
    const mortgageInfo =
      mortgageSchedule.find(function (schedule) {
        return schedule.year === year;
      }) || {
        mortgageStartBalance: 0,
        mortgageEndBalance: 0,
        mortgageAnnualPrincipal: 0,
        mortgageAnnualInterest: 0
      };

    if (year >= startYear) {
      results.push({
        year: year,
        familyAges: familyAges,
        events: yearEvents.map(function (event) {
          return cloneData(event);
        }),
        eventExpenseTotal: eventExpenseTotal,
        annualIncome: annualIncome,
        regularExpenses: regularExpenses,
        totalExpenses: totalExpenses,
        annualBalance: annualBalance,
        startAssets: startAssets,
        endAssets: endAssets,
        mortgageStartBalance: mortgageInfo.mortgageStartBalance,
        mortgageEndBalance: mortgageInfo.mortgageEndBalance,
        mortgageAnnualPrincipal: mortgageInfo.mortgageAnnualPrincipal,
        mortgageAnnualInterest: mortgageInfo.mortgageAnnualInterest,
        estimatedNetAssets: endAssets - mortgageInfo.mortgageEndBalance,
        dollarInsuranceCumulativePremiumUsd: dollarInsuranceReference.dollarInsuranceCumulativePremiumUsd,
        dollarInsuranceCumulativePremiumJpy: dollarInsuranceReference.dollarInsuranceCumulativePremiumJpy,
        dollarInsuranceCashValueUsd: dollarInsuranceReference.dollarInsuranceCashValueUsd,
        dollarInsuranceCashValueJpy: dollarInsuranceReference.dollarInsuranceCashValueJpy,
        dollarInsuranceReturnRate: dollarInsuranceReference.dollarInsuranceReturnRate
      });
    }

    startAssets = endAssets;
  }

  return results;
}

// ダッシュボードの数値を表示します。
function renderDashboard() {
  if (!lifePlanData) {
    return;
  }

  const totalAssets = calculateTotalAssets(lifePlanData);
  const netAssets = calculateNetAssets(lifePlanData);
  const finalResult = lifePlanResults[lifePlanResults.length - 1];
  const finalAssets = finalResult ? finalResult.endAssets : 0;
  const currentMortgageBalance = toNumber(lifePlanData.mortgage && lifePlanData.mortgage.currentBalance);
  const finalMortgageBalance = finalResult ? finalResult.mortgageEndBalance : 0;
  const finalEstimatedNetAssets = finalResult ? finalResult.estimatedNetAssets : 0;
  const mortgagePayoffResult = lifePlanResults.find(function (result) {
    return toNumber(result.mortgageEndBalance) <= 0 && toNumber(result.mortgageStartBalance) > 0;
  });
  const firstNegativeResult = lifePlanResults.find(function (result) {
    return toNumber(result.endAssets) < 0;
  });
  const events = Array.isArray(lifePlanData.events) ? lifePlanData.events : [];
  const largeEventCount = events.filter(function (event) {
    return toNumber(event.amount) >= 1000000;
  }).length;

  setElementText("dashboard-total-assets", formatYen(totalAssets), totalAssets < 0);
  setElementText("dashboard-net-assets", formatYen(netAssets), netAssets < 0);
  setElementText("dashboard-final-assets", formatYen(finalAssets), finalAssets < 0);
  setElementText(
    "dashboard-negative-year",
    firstNegativeResult ? `${firstNegativeResult.year}年` : "なし",
    Boolean(firstNegativeResult)
  );
  setElementText("dashboard-large-events", `${largeEventCount}件`, false);

  ensureDashboardCard("dashboard-current-mortgage-balance", "現在住宅ローン残高");
  ensureDashboardCard("dashboard-final-mortgage-balance", "最終年の住宅ローン残高");
  ensureDashboardCard("dashboard-mortgage-payoff-year", "住宅ローン完済予定年");
  ensureDashboardCard("dashboard-final-net-assets", "最終年の純資産見込み");
  setElementText("dashboard-current-mortgage-balance", formatYen(currentMortgageBalance), false);
  setElementText("dashboard-final-mortgage-balance", formatYen(finalMortgageBalance), false);
  setElementText("dashboard-mortgage-payoff-year", mortgagePayoffResult ? `${mortgagePayoffResult.year}年` : "未完済", false);
  setElementText("dashboard-final-net-assets", formatYen(finalEstimatedNetAssets), finalEstimatedNetAssets < 0);
}

// 家族一覧をカード形式で表示します。
function renderFamilyList() {
  const familyList = getElement("family-list");

  if (!familyList || !lifePlanData) {
    return;
  }

  clearElement(familyList);

  const family = Array.isArray(lifePlanData.family) ? lifePlanData.family : [];
  const startYear = toNumber(lifePlanData.settings && lifePlanData.settings.startYear);

  if (family.length === 0) {
    familyList.appendChild(createTextElement("p", "list-meta", "家族データはありません。"));
    return;
  }

  family.forEach(function (member) {
    const card = document.createElement("article");
    const buttonRow = document.createElement("div");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const age = calculateAgeInYear(member.birthDate, startYear);

    card.className = "list-card";
    card.appendChild(createTextElement("h3", "list-title", member.name || "名前未設定"));
    card.appendChild(
      createTextElement(
        "p",
        "list-meta",
        `続柄: ${member.relationship || "-"} / 生年月日: ${member.birthDate || "-"} / ${startYear}年時点: ${
          age === null ? "不明" : `${age}歳`
        }`
      )
    );
    card.appendChild(createTextElement("p", "list-memo", `メモ: ${member.memo || "-"}`));

    buttonRow.className = "button-row";
    editButton.type = "button";
    editButton.className = "secondary-button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", function () {
      startEditFamily(member.id);
    });
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", function () {
      handleDeleteFamily(member.id);
    });
    buttonRow.appendChild(editButton);
    buttonRow.appendChild(deleteButton);
    card.appendChild(buttonRow);

    familyList.appendChild(card);
  });
}

// 家族の編集モードを開始します。
function startEditFamily(familyId) {
  const family = Array.isArray(lifePlanData && lifePlanData.family) ? lifePlanData.family : [];
  const targetFamily = family.find(function (member) {
    return member.id === familyId;
  });

  if (!targetFamily) {
    showMessage("編集する家族が見つかりません", "error");
    return;
  }

  editingFamilyId = familyId;
  openFormPanel("familyForm");
  renderFamilyForm();

  const formArea = getElement("family-form-area");

  if (formArea && typeof formArea.scrollIntoView === "function") {
    formArea.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  showMessage("家族情報を編集できます", "success");
}

// 家族編集をキャンセルします。
function cancelEditFamily() {
  editingFamilyId = null;
  renderFamilyForm();
  showMessage("家族編集をキャンセルしました", "success");
}

// 指定されたIDの家族を削除します。
function handleDeleteFamily(familyId) {
  const family = Array.isArray(lifePlanData && lifePlanData.family) ? lifePlanData.family : [];
  const events = Array.isArray(lifePlanData && lifePlanData.events) ? lifePlanData.events : [];
  const targetFamily = family.find(function (member) {
    return member.id === familyId;
  });
  const relatedEvents = events.filter(function (lifeEvent) {
    return lifeEvent.targetFamilyId === familyId;
  });

  if (!targetFamily) {
    showMessage("削除する家族が見つかりません", "error");
    return;
  }

  if (relatedEvents.length > 0) {
    showMessage("この家族を対象にしたイベントがあります。先にイベントの対象者を変更または削除してください。", "error");
    return;
  }

  const confirmMessage = targetFamily.name ? `${targetFamily.name}を削除しますか？` : "この家族を削除しますか？";
  const shouldDelete = confirm(confirmMessage);

  if (!shouldDelete) {
    return;
  }

  lifePlanData.family = family.filter(function (member) {
    return member.id !== familyId;
  });

  if (editingFamilyId === familyId) {
    editingFamilyId = null;
  }

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("家族を削除しました", "success");
  }
}

// イベント一覧をカード形式で表示します。
function renderEventList() {
  const eventList = getElement("event-list");

  if (!eventList || !lifePlanData) {
    return;
  }

  clearElement(eventList);

  const events = Array.isArray(lifePlanData.events) ? lifePlanData.events : [];
  const family = Array.isArray(lifePlanData.family) ? lifePlanData.family : [];

  if (events.length === 0) {
    eventList.appendChild(createTextElement("p", "list-meta", "イベントデータはありません。"));
    return;
  }

  events.forEach(function (event, index) {
    const card = document.createElement("article");
    const buttonRow = document.createElement("div");
    const moveUpButton = document.createElement("button");
    const moveDownButton = document.createElement("button");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const eventYear = getEventYear(event, lifePlanData);
    const targetFamily = family.find(function (member) {
      return member.id === event.targetFamilyId;
    });
    const targetName = event.targetFamilyId ? (targetFamily ? targetFamily.name : "不明") : "家族全体";

    card.className = "list-card";
    card.appendChild(createTextElement("h3", "list-title", event.name || "イベント名未設定"));
    card.appendChild(
      createTextElement(
        "p",
        "list-meta",
        `カテゴリ: ${event.category || "-"} / 発生年: ${eventYear === null ? "未定" : `${eventYear}年`} / 金額: ${formatYen(
          event.amount
        )} / 対象者: ${targetName}`
      )
    );
    card.appendChild(createTextElement("p", "list-memo", `メモ: ${event.memo || "-"}`));

    buttonRow.className = "button-row event-action-row";
    moveUpButton.type = "button";
    moveUpButton.className = "secondary-button small-button event-action-button";
    moveUpButton.textContent = "上へ";
    moveUpButton.disabled = index === 0;
    moveUpButton.addEventListener("click", function () {
      moveEvent(event.id, "up");
    });
    moveDownButton.type = "button";
    moveDownButton.className = "secondary-button small-button event-action-button";
    moveDownButton.textContent = "下へ";
    moveDownButton.disabled = index === events.length - 1;
    moveDownButton.addEventListener("click", function () {
      moveEvent(event.id, "down");
    });
    editButton.type = "button";
    editButton.className = "secondary-button small-button event-action-button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", function () {
      startEditEvent(event.id);
    });
    deleteButton.type = "button";
    deleteButton.className = "danger-button small-button event-action-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", function () {
      handleDeleteEvent(event.id);
    });
    buttonRow.appendChild(moveUpButton);
    buttonRow.appendChild(moveDownButton);
    buttonRow.appendChild(editButton);
    buttonRow.appendChild(deleteButton);
    card.appendChild(buttonRow);

    eventList.appendChild(card);
  });
}

// 指定されたIDのイベントを削除します。
function handleDeleteEvent(eventId) {
  const events = Array.isArray(lifePlanData && lifePlanData.events) ? lifePlanData.events : [];
  const targetEvent = events.find(function (event) {
    return event.id === eventId;
  });

  if (!targetEvent) {
    showMessage("削除するイベントが見つかりません", "error");
    return;
  }

  const confirmMessage = targetEvent.name ? `${targetEvent.name}を削除しますか？` : "このイベントを削除しますか？";
  const shouldDelete = confirm(confirmMessage);

  if (!shouldDelete) {
    return;
  }

  lifePlanData.events = events.filter(function (event) {
    return event.id !== eventId;
  });

  if (editingEventId === eventId) {
    editingEventId = null;
  }

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("イベントを削除しました", "success");
  }
}

// イベント一覧の表示順を上下に入れ替えます。
function moveEvent(eventId, direction) {
  const events = Array.isArray(lifePlanData && lifePlanData.events) ? lifePlanData.events : [];
  const currentIndex = events.findIndex(function (event) {
    return event.id === eventId;
  });
  const moveOffset = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const nextIndex = currentIndex + moveOffset;

  if (currentIndex < 0 || moveOffset === 0 || nextIndex < 0 || nextIndex >= events.length) {
    return;
  }

  const currentEvent = events[currentIndex];
  events[currentIndex] = events[nextIndex];
  events[nextIndex] = currentEvent;

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("イベントの順番を変更しました", "success");
  }
}

// イベントの編集モードを開始します。
function startEditEvent(eventId) {
  const events = Array.isArray(lifePlanData && lifePlanData.events) ? lifePlanData.events : [];
  const targetEvent = events.find(function (event) {
    return event.id === eventId;
  });

  if (!targetEvent) {
    showMessage("編集するイベントが見つかりません", "error");
    return;
  }

  editingEventId = eventId;
  openFormPanel("eventForm");
  renderEventForm();

  const formArea = getElement("event-form-area");

  if (formArea && typeof formArea.scrollIntoView === "function") {
    formArea.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  showMessage("イベントを編集できます", "success");
}

// イベント編集をキャンセルします。
function cancelEditEvent() {
  editingEventId = null;
  renderEventForm();
  showMessage("イベント編集をキャンセルしました", "success");
}

// サマリー表示用のカードを作ります。
function renderSummaryCard(containerId, title, items) {
  const container = getElement(containerId);

  if (!container) {
    return;
  }

  clearElement(container);

  const card = document.createElement("article");
  card.className = "list-card";
  card.appendChild(createTextElement("h3", "list-title", title));

  items.forEach(function (item) {
    card.appendChild(createTextElement("p", "list-meta", `${item.label}: ${item.value}`));
  });

  container.appendChild(card);
}

// ライフプラン表の列グループ設定です。
function getTableColumnConfig() {
  return [
    { key: "familyAges", label: "家族年齢" },
    { key: "income", label: "収入" },
    { key: "regularExpenses", label: "通常支出" },
    { key: "eventExpenses", label: "イベント支出" },
    { key: "annualBalance", label: "年間収支" },
    { key: "yearEndAssets", label: "年末資産" },
    { key: "mortgage", label: "住宅ローン" },
    { key: "netAssets", label: "純資産" },
    { key: "dollarInsurance", label: "ドル建終身保険" }
  ];
}

// 計算設定セクションを画面に用意します。
function ensureCalculationSettingsSection() {
  let section = getElement("calculation-settings-section");

  if (section) {
    return section;
  }

  section = document.createElement("section");
  section.id = "calculation-settings-section";
  section.setAttribute("aria-labelledby", "calculation-settings-heading");
  section.appendChild(createTextElement("h2", "", "計算設定"));

  const heading = section.querySelector ? section.querySelector("h2") : null;
  if (heading) {
    heading.id = "calculation-settings-heading";
  }

  const formArea = document.createElement("div");
  formArea.id = "calculation-settings-form-area";
  section.appendChild(formArea);

  const familySection = getElement("family-section");
  const dashboardSection = getElement("dashboard-section");
  const main = document.querySelector ? document.querySelector("main") : document.body;

  if (familySection && familySection.parentNode) {
    familySection.parentNode.insertBefore(section, familySection);
  } else if (dashboardSection && dashboardSection.parentNode) {
    dashboardSection.parentNode.insertBefore(section, dashboardSection.nextSibling);
  } else if (main) {
    main.appendChild(section);
  }

  return section;
}

// ライフプラン表の直前に、表示列設定を置く領域を用意します。
function ensureLifePlanTableSettingsArea() {
  const section = getElement("life-plan-section");

  if (!section) {
    return null;
  }

  let settingsArea = getElement("life-plan-table-settings-area");
  const tableScroll = section.querySelector ? section.querySelector(".table-scroll") : null;
  const content = getElement("life-plan-section-content");
  const parent = tableScroll && tableScroll.parentNode ? tableScroll.parentNode : content || section;

  if (!settingsArea) {
    settingsArea = document.createElement("div");
    settingsArea.id = "life-plan-table-settings-area";
    settingsArea.className = "table-display-settings-area";
  }

  if (tableScroll && settingsArea.nextSibling !== tableScroll) {
    parent.insertBefore(settingsArea, tableScroll);
  } else if (!settingsArea.parentNode) {
    parent.appendChild(settingsArea);
  }

  return settingsArea;
}

// 数値入力欄に最小・最大値を設定します。
function setNumberFieldLimits(field, min, max) {
  const input = field && field.querySelector ? field.querySelector("input") : null;

  if (!input) {
    return;
  }

  if (hasValue(min)) {
    input.min = String(min);
  }

  if (hasValue(max)) {
    input.max = String(max);
  }
}

// 現在資産などの基準年に関する説明文を作ります。
function getBaseYearDescription(settings) {
  const baseYear = toNumber(settings && settings.baseYear);
  return `現在資産・収入・支出は ${baseYear}年時点の入力値として計算しています。2027年以降に使う場合は、計算開始年と現在資産の基準年をその年に変更し、その時点の資産・収入・支出に更新してください。`;
}

// 計算設定フォームを表示します。
function renderCalculationSettingsForm() {
  const formArea = getElement("calculation-settings-form-area");

  if (!formArea || !lifePlanData) {
    return;
  }

  clearElement(formArea);

  const settings = lifePlanData.settings || {};
  const form = document.createElement("form");
  const grid = document.createElement("div");
  const buttonRow = document.createElement("div");
  const submitButton = document.createElement("button");
  const startYearField = createNumberField("settings-start-year", "計算開始年", settings.startYear);
  const endYearField = createNumberField("settings-end-year", "計算終了年", settings.endYear);
  const baseYearField = createNumberField("settings-base-year", "現在資産の基準年", settings.baseYear);

  setNumberFieldLimits(startYearField, 1900, 2200);
  setNumberFieldLimits(endYearField, 1900, 2200);
  setNumberFieldLimits(baseYearField, 1900, 2200);

  form.id = "calculation-settings-form";
  form.addEventListener("submit", handleCalculationSettingsSubmit);
  grid.className = "form-grid";
  grid.appendChild(startYearField);
  grid.appendChild(endYearField);
  grid.appendChild(baseYearField);
  grid.appendChild(createTextareaField("settings-memo", "メモ", settings.memo || ""));

  buttonRow.className = "button-row";
  submitButton.type = "submit";
  submitButton.className = "primary-button";
  submitButton.textContent = "計算設定を保存";
  buttonRow.appendChild(submitButton);

  form.appendChild(createTextElement("h3", "list-title", "計算期間と基準年"));
  form.appendChild(createTextElement("p", "list-memo", getBaseYearDescription(settings)));
  form.appendChild(grid);
  form.appendChild(buttonRow);
  formArea.appendChild(form);
}

// 計算設定の入力値をチェックします。
function validateCalculationSettings(startYear, endYear, baseYear) {
  if (startYear < 1900 || startYear > 2200) {
    return "計算開始年は1900年以上、2200以下で入力してください";
  }

  if (endYear < startYear) {
    return "計算終了年は計算開始年以上で入力してください";
  }

  if (endYear - startYear + 1 > 80) {
    return "計算期間は最大80年程度までにしてください";
  }

  if (baseYear < 1900 || baseYear > 2200) {
    return "現在資産の基準年は1900年以上、2200以下で入力してください";
  }

  if (baseYear > startYear) {
    return "現在資産の基準年は計算開始年と同じ、または計算開始年以前にしてください";
  }

  return "";
}

// 計算設定フォームの内容を保存します。
function handleCalculationSettingsSubmit(event) {
  event.preventDefault();

  if (!lifePlanData) {
    lifePlanData = getInitialDataCopy();
  }

  const startYear = Math.trunc(getInputNumber("settings-start-year"));
  const endYear = Math.trunc(getInputNumber("settings-end-year"));
  const baseYear = Math.trunc(getInputNumber("settings-base-year"));
  const memo = getInputValue("settings-memo");
  const validationMessage = validateCalculationSettings(startYear, endYear, baseYear);

  if (validationMessage) {
    showMessage(validationMessage, "error");
    return;
  }

  lifePlanData.settings = Object.assign({}, lifePlanData.settings || {}, {
    startYear: startYear,
    endYear: endYear,
    baseYear: baseYear,
    memo: memo
  });

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("計算設定を保存しました", "success");
  }
}

// ライフプラン表の表示列設定を表示します。
function renderTableDisplaySettings() {
  const settingsArea = ensureLifePlanTableSettingsArea();

  if (!settingsArea) {
    return;
  }

  clearElement(settingsArea);

  const card = document.createElement("article");
  const checkboxGrid = document.createElement("div");
  const compactField = createCheckboxField("compact-life-plan-table", "コンパクト表示", isCompactLifePlanTable());
  const compactInput = compactField.querySelector ? compactField.querySelector("input") : null;

  card.className = "list-card";
  checkboxGrid.className = "checkbox-grid";
  card.appendChild(createTextElement("h3", "list-title", "ライフプラン表の表示列設定"));

  getTableColumnConfig().forEach(function (config) {
    const field = createCheckboxField(`table-column-${config.key}`, config.label, isTableColumnVisible(config.key));
    const input = field.querySelector ? field.querySelector("input") : null;

    if (input) {
      input.addEventListener("change", function () {
        setTableColumnVisibility(config.key, input.checked);
        renderAll();
      });
    }

    checkboxGrid.appendChild(field);
  });

  if (compactInput) {
    compactInput.addEventListener("change", function () {
      setCompactLifePlanTable(compactInput.checked);
      renderAll();
    });
  }

  card.appendChild(checkboxGrid);
  card.appendChild(compactField);
  card.appendChild(createTextElement("p", "list-memo", "列表示設定とコンパクト表示はUI状態として保存します。家計データ本体には影響しません。"));
  settingsArea.appendChild(card);
}

// 計算設定セクション全体を描画します。
function renderCalculationSettingsSection() {
  ensureCalculationSettingsSection();
  renderCalculationSettingsForm();
}

// 資産・収入・支出のサマリーを表示します。
function renderFinanceSummaries() {
  if (!lifePlanData) {
    return;
  }

  const assets = lifePlanData.assets || {};
  const income = lifePlanData.income || {};
  const cashTotal = calculateCashTotal(lifePlanData);
  const investmentTotal = calculateInvestmentTotal(lifePlanData);
  const monthlyExpenseTotal = calculateMonthlyExpenseTotal(lifePlanData);
  const annualExpenseTotal = calculateAnnualExpenseItemTotal(lifePlanData);

  renderSummaryCard("asset-summary", "現在資産", [
    { label: "現金預金合計", value: formatYen(cashTotal) },
    { label: "投資資産合計", value: formatYen(investmentTotal) },
    { label: "保険解約返戻金", value: formatYen(assets.insurance) },
    { label: "その他資産", value: formatYen(assets.otherAssets) },
    { label: "負債", value: formatYen(assets.liabilities) },
    { label: "現在総資産", value: formatYen(calculateTotalAssets(lifePlanData)) },
    { label: "現在純資産", value: formatYen(calculateNetAssets(lifePlanData)) }
  ]);

  renderSummaryCard("income-summary", "収入", [
    { label: "手取り年収", value: formatYen(income.salary) },
    { label: "賞与", value: formatYen(income.bonus) },
    { label: "手当", value: formatYen(income.allowance) },
    { label: "その他収入", value: formatYen(income.otherIncome) },
    {
      label: "年間収入合計",
      value: formatYen(calculateAnnualIncome(lifePlanData, lifePlanData.settings && lifePlanData.settings.startYear))
    }
  ]);

  renderSummaryCard("expense-summary", "支出", [
    { label: "毎月支出合計", value: formatYen(monthlyExpenseTotal) },
    { label: "毎月支出の年間換算", value: formatYen(monthlyExpenseTotal * 12) },
    { label: "毎年支出合計", value: formatYen(annualExpenseTotal) },
    { label: "通常年間支出", value: formatYen(calculateAnnualRegularExpenses(lifePlanData)) }
  ]);
}

// 数値入力欄を作ります。
function createNumberField(id, label, value, step, min, inputMode) {
  const field = document.createElement("div");
  const labelElement = document.createElement("label");
  const input = document.createElement("input");
  const stepValue = step || "1";

  field.className = "form-field";
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  input.type = "number";
  input.id = id;
  input.name = id;
  input.step = stepValue;
  input.inputMode = inputMode || (String(stepValue).includes(".") ? "decimal" : "numeric");
  if (hasValue(min)) {
    input.min = String(min);
  }
  input.value = toNumber(value);

  field.appendChild(labelElement);
  field.appendChild(input);
  return field;
}

// フォーム内の入力グループを作ります。
function appendFinanceFormGroup(form, title, fields, note) {
  const group = document.createElement("div");
  const grid = document.createElement("div");

  group.className = "list-card";
  grid.className = "form-grid";
  group.appendChild(createTextElement("h3", "list-title", title));

  fields.forEach(function (field) {
    grid.appendChild(createNumberField(field.id, field.label, field.value, field.step, field.min, field.inputMode));
  });

  group.appendChild(grid);

  if (note) {
    group.appendChild(createTextElement("p", "list-memo", note));
  }

  form.appendChild(group);
}

// 内訳行の入力欄を作ります。
function createFinanceItemInput(type, className, value, label, step) {
  const input = document.createElement(type === "textarea" ? "textarea" : "input");

  if (type !== "textarea") {
    input.type = type;
  }

  input.className = className;
  input.value = type === "number" ? toNumber(value) : value || "";
  input.setAttribute("aria-label", label);

  if (type === "number") {
    input.step = step || "1";
    input.inputMode = "numeric";
  }

  return input;
}

// 資産・支出の内訳編集行を追加します。
function appendFinanceItemEditorRow(list, item, prefix) {
  const row = document.createElement("div");
  const deleteButton = document.createElement("button");
  const safeItem = item || createFinanceItem(createId(prefix), "", 0, "");

  row.className = "finance-item-row";
  row.dataset.itemId = safeItem.id || createId(prefix);
  row.appendChild(createFinanceItemInput("text", "finance-item-name", safeItem.name, "項目名"));
  row.appendChild(createFinanceItemInput("number", "finance-item-amount", safeItem.amount, "金額"));
  row.appendChild(createFinanceItemInput("text", "finance-item-memo", safeItem.memo, "メモ"));

  deleteButton.type = "button";
  deleteButton.className = "danger-button finance-item-delete-button";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", function () {
    row.remove();
    updateFinanceItemTotals();
  });
  row.appendChild(deleteButton);

  Array.prototype.slice.call(row.querySelectorAll("input")).forEach(function (input) {
    input.addEventListener("input", updateFinanceItemTotals);
  });

  list.appendChild(row);
}

// 内訳入力エリアを作ります。
function appendFinanceItemEditorSection(form, options) {
  const group = document.createElement("div");
  const header = document.createElement("div");
  const list = document.createElement("div");
  const addButton = document.createElement("button");
  const totalText = document.createElement("p");

  group.className = "list-card finance-item-editor";
  header.className = "finance-item-editor-header";
  list.id = options.listId;
  list.className = "finance-item-list";
  totalText.id = options.totalId;
  totalText.className = "list-meta finance-item-total";

  header.appendChild(createTextElement("h3", "list-title", options.title));
  addButton.type = "button";
  addButton.className = "secondary-button small-button";
  addButton.textContent = options.addButtonText || "項目を追加";
  addButton.addEventListener("click", function () {
    appendFinanceItemEditorRow(list, createFinanceItem(createId(options.itemPrefix), "", 0, ""), options.itemPrefix);
    updateFinanceItemTotals();
  });
  header.appendChild(addButton);

  group.appendChild(header);

  if (options.note) {
    group.appendChild(createTextElement("p", "list-memo", options.note));
  }

  (Array.isArray(options.items) ? options.items : []).forEach(function (item) {
    appendFinanceItemEditorRow(list, item, options.itemPrefix);
  });

  group.appendChild(list);
  group.appendChild(totalText);

  if (options.annualizedId) {
    const annualizedText = document.createElement("p");
    annualizedText.id = options.annualizedId;
    annualizedText.className = "list-meta finance-item-total";
    group.appendChild(annualizedText);
  }

  form.appendChild(group);
}

// 内訳入力欄から行データを集めます。
function collectFinanceItems(listId, prefix) {
  const list = getElement(listId);

  if (!list || !list.querySelectorAll) {
    return [];
  }

  return Array.prototype.slice
    .call(list.querySelectorAll(".finance-item-row"))
    .map(function (row) {
      const nameInput = row.querySelector(".finance-item-name");
      const amountInput = row.querySelector(".finance-item-amount");
      const memoInput = row.querySelector(".finance-item-memo");
      const name = String((nameInput && nameInput.value) || "").trim();
      const amount = toNumber(amountInput && amountInput.value);
      const memo = String((memoInput && memoInput.value) || "").trim();

      if (!name && amount === 0 && !memo) {
        return null;
      }

      return createFinanceItem(row.dataset.itemId || createId(prefix), name || "未設定項目", amount, memo);
    })
    .filter(Boolean);
}

// 内訳入力中の合計表示を更新します。
function updateFinanceItemTotals() {
  const cashTotal = sumFinanceItems(collectFinanceItems("finance-cash-accounts-list", "cash"));
  const investmentTotal = sumFinanceItems(collectFinanceItems("finance-investment-items-list", "investment"));
  const monthlyTotal = sumFinanceItems(collectFinanceItems("finance-monthly-items-list", "monthly"));
  const annualTotal = sumFinanceItems(collectFinanceItems("finance-annual-items-list", "annual"));
  const cashElement = getElement("finance-cash-accounts-total");
  const investmentElement = getElement("finance-investment-items-total");
  const monthlyElement = getElement("finance-monthly-items-total");
  const monthlyAnnualizedElement = getElement("finance-monthly-items-annualized-total");
  const annualElement = getElement("finance-annual-items-total");

  if (cashElement) {
    cashElement.textContent = `現金預金合計: ${formatYen(cashTotal)}`;
  }

  if (investmentElement) {
    investmentElement.textContent = `投資資産合計: ${formatYen(investmentTotal)}`;
  }

  if (monthlyElement) {
    monthlyElement.textContent = `毎月支出合計: ${formatYen(monthlyTotal)}`;
  }

  if (monthlyAnnualizedElement) {
    monthlyAnnualizedElement.textContent = `年間換算: ${formatYen(monthlyTotal * 12)}`;
  }

  if (annualElement) {
    annualElement.textContent = `毎年支出合計: ${formatYen(annualTotal)}`;
  }
}

// 指定した input の値を数値として取得します。
function getInputNumber(id) {
  const input = getElement(id);

  if (!input) {
    return 0;
  }

  return toNumber(input.value);
}

// 指定した input や textarea の文字列を取得します。
function getInputValue(id) {
  const input = getElement(id);

  if (!input) {
    return "";
  }

  return String(input.value || "").trim();
}

// 新しいデータ用のIDを作ります。
function createId(prefix) {
  return `${prefix}_${Date.now()}`;
}

// テキスト入力欄を作ります。
function createTextField(id, label, required, value) {
  const field = document.createElement("div");
  const labelElement = document.createElement("label");
  const input = document.createElement("input");

  field.className = "form-field";
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  input.type = "text";
  input.id = id;
  input.name = id;
  input.required = Boolean(required);
  input.value = value || "";

  field.appendChild(labelElement);
  field.appendChild(input);
  return field;
}

// 日付入力欄を作ります。
function createDateField(id, label, required, value) {
  const field = document.createElement("div");
  const labelElement = document.createElement("label");
  const input = document.createElement("input");

  field.className = "form-field";
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  input.type = "date";
  input.id = id;
  input.name = id;
  input.required = Boolean(required);
  input.value = value || "";

  field.appendChild(labelElement);
  field.appendChild(input);
  return field;
}

// イベント用の数値入力欄を作ります。
function createEventNumberField(id, label, required, placeholder, value) {
  const field = createNumberField(id, label, value);
  const input = field.querySelector ? field.querySelector("input") : null;

  if (input) {
    input.required = Boolean(required);
    input.placeholder = placeholder || "";
    input.value = hasValue(value) ? toNumber(value) : "";
  }

  return field;
}

// 選択欄を作ります。
function createSelectField(id, label, options, selectedValue) {
  const field = document.createElement("div");
  const labelElement = document.createElement("label");
  const select = document.createElement("select");

  field.className = "form-field";
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  select.id = id;
  select.name = id;

  options.forEach(function (option) {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;

    if (option.value === selectedValue) {
      optionElement.selected = true;
    }

    select.appendChild(optionElement);
  });

  field.appendChild(labelElement);
  field.appendChild(select);
  return field;
}

// メモ入力用の textarea を作ります。
function createTextareaField(id, label, value) {
  const field = document.createElement("div");
  const labelElement = document.createElement("label");
  const textarea = document.createElement("textarea");

  field.className = "form-field";
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  textarea.id = id;
  textarea.name = id;
  textarea.value = value || "";

  field.appendChild(labelElement);
  field.appendChild(textarea);
  return field;
}

// チェックボックス入力欄を作ります。
function createCheckboxField(id, label, checked) {
  const field = document.createElement("label");
  const input = document.createElement("input");
  const text = document.createElement("span");

  field.className = "checkbox-field";
  input.type = "checkbox";
  input.id = id;
  input.checked = Boolean(checked);
  text.textContent = label;

  field.appendChild(input);
  field.appendChild(text);
  return field;
}

// 家族追加・編集フォームを表示します。
function renderFamilyForm() {
  const formArea = getElement("family-form-area");

  if (!formArea || !lifePlanData) {
    return;
  }

  clearElement(formArea);

  const family = Array.isArray(lifePlanData.family) ? lifePlanData.family : [];
  const editingFamily = editingFamilyId
    ? family.find(function (member) {
        return member.id === editingFamilyId;
      })
    : null;
  const isEditing = Boolean(editingFamily);
  const form = document.createElement("form");
  const grid = document.createElement("div");
  const buttonRow = document.createElement("div");
  const submitButton = document.createElement("button");
  const cancelButton = document.createElement("button");
  const panel = createFormPanel(formArea, "familyForm");

  if (editingFamilyId && !editingFamily) {
    editingFamilyId = null;
  }

  form.id = "family-form";
  form.addEventListener("submit", handleFamilyFormSubmit);
  grid.className = "form-grid";

  form.appendChild(createTextElement("h3", "list-title", isEditing ? "家族編集" : "家族追加"));
  grid.appendChild(createTextField("family-name", "名前", true, isEditing ? editingFamily.name : ""));
  grid.appendChild(createDateField("family-birth-date", "生年月日", true, isEditing ? editingFamily.birthDate : ""));
  grid.appendChild(createTextField("family-relationship", "続柄", true, isEditing ? editingFamily.relationship : ""));
  grid.appendChild(createTextareaField("family-memo", "メモ", isEditing ? editingFamily.memo : ""));

  buttonRow.className = "button-row";
  submitButton.type = "submit";
  submitButton.className = "primary-button";
  submitButton.textContent = isEditing ? "家族情報を更新" : "家族を追加";
  buttonRow.appendChild(submitButton);

  if (isEditing) {
    cancelButton.type = "button";
    cancelButton.className = "secondary-button";
    cancelButton.textContent = "キャンセル";
    cancelButton.addEventListener("click", cancelEditFamily);
    buttonRow.appendChild(cancelButton);
  }

  form.appendChild(grid);
  form.appendChild(buttonRow);
  panel.appendChild(form);
  applyFormPanelState("familyForm");
}

// 家族フォームの内容を追加または更新します。
function handleFamilyFormSubmit(event) {
  event.preventDefault();

  const name = getInputValue("family-name");
  const birthDate = getInputValue("family-birth-date");
  const relationship = getInputValue("family-relationship");
  const memo = getInputValue("family-memo");

  if (!name) {
    showMessage("名前を入力してください", "error");
    return;
  }

  if (!birthDate) {
    showMessage("生年月日を入力してください", "error");
    return;
  }

  if (!relationship) {
    showMessage("続柄を入力してください", "error");
    return;
  }

  if (!lifePlanData.family || !Array.isArray(lifePlanData.family)) {
    lifePlanData.family = [];
  }

  if (editingFamilyId) {
    const targetFamily = lifePlanData.family.find(function (member) {
      return member.id === editingFamilyId;
    });

    if (!targetFamily) {
      showMessage("更新する家族が見つかりません", "error");
      return;
    }

    targetFamily.name = name;
    targetFamily.birthDate = birthDate;
    targetFamily.relationship = relationship;
    targetFamily.memo = memo;

    const saved = saveData();
    editingFamilyId = null;
    renderAll();

    if (saved) {
      showMessage("家族情報を更新しました", "success");
    }

    return;
  }

  lifePlanData.family.push({
    id: createId("family"),
    name: name,
    birthDate: birthDate,
    relationship: relationship,
    memo: memo
  });

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("家族を追加しました", "success");
  }
}

// イベント追加フォームを表示します。
function renderEventForm() {
  const formArea = getElement("event-form-area");

  if (!formArea || !lifePlanData) {
    return;
  }

  clearElement(formArea);

  const form = document.createElement("form");
  const grid = document.createElement("div");
  const buttonRow = document.createElement("div");
  const submitButton = document.createElement("button");
  const cancelButton = document.createElement("button");
  const panel = createFormPanel(formArea, "eventForm");
  const categories = typeof EVENT_CATEGORIES === "undefined" ? ["その他"] : EVENT_CATEGORIES;
  const family = Array.isArray(lifePlanData.family) ? lifePlanData.family : [];
  const events = Array.isArray(lifePlanData.events) ? lifePlanData.events : [];
  const editingEvent = editingEventId
    ? events.find(function (event) {
        return event.id === editingEventId;
      })
    : null;
  const isEditing = Boolean(editingEvent);
  const selectedCategory = isEditing ? editingEvent.category || "その他" : "その他";
  const categoryValues = categories.includes(selectedCategory) ? categories : categories.concat(selectedCategory);
  const categoryOptions = categoryValues.map(function (category) {
    return {
      value: category,
      label: category
    };
  });
  const familyOptions = [
    {
      value: "",
      label: "家族全体"
    }
  ].concat(
    family.map(function (member) {
      return {
        value: member.id,
        label: member.name
      };
    })
  );

  form.id = "event-form";
  form.addEventListener("submit", handleEventFormSubmit);
  grid.className = "form-grid";

  if (editingEventId && !editingEvent) {
    editingEventId = null;
  }

  form.appendChild(createTextElement("h3", "list-title", isEditing ? "イベント編集" : "イベント追加"));
  grid.appendChild(createTextField("event-name", "イベント名", true, isEditing ? editingEvent.name : ""));
  grid.appendChild(createSelectField("event-category", "カテゴリ", categoryOptions, selectedCategory));
  grid.appendChild(createSelectField("event-target-family", "対象者", familyOptions, isEditing ? editingEvent.targetFamilyId || "" : ""));
  grid.appendChild(
    createEventNumberField("event-scheduled-year", "予定年", false, "2030", isEditing ? editingEvent.scheduledYear : null)
  );
  grid.appendChild(
    createEventNumberField("event-target-age", "対象者の年齢", false, "18", isEditing ? editingEvent.targetAge : null)
  );
  grid.appendChild(createEventNumberField("event-amount", "金額", true, "1000000", isEditing ? editingEvent.amount : null));
  grid.appendChild(createTextareaField("event-memo", "メモ", isEditing ? editingEvent.memo : ""));

  buttonRow.className = "button-row";
  submitButton.type = "submit";
  submitButton.className = "primary-button";
  submitButton.textContent = isEditing ? "イベントを更新" : "イベントを追加";

  buttonRow.appendChild(submitButton);

  if (isEditing) {
    cancelButton.type = "button";
    cancelButton.className = "secondary-button";
    cancelButton.textContent = "キャンセル";
    cancelButton.addEventListener("click", cancelEditEvent);
    buttonRow.appendChild(cancelButton);
  }

  form.appendChild(grid);
  form.appendChild(buttonRow);
  panel.appendChild(form);
  applyFormPanelState("eventForm");
}

// イベント追加フォームの送信内容をチェックして保存します。
function handleEventFormSubmit(event) {
  event.preventDefault();

  const name = getInputValue("event-name");
  const category = getInputValue("event-category") || "その他";
  const targetFamilyId = getInputValue("event-target-family") || null;
  const scheduledYearText = getInputValue("event-scheduled-year");
  const targetAgeText = getInputValue("event-target-age");
  const amount = getInputNumber("event-amount");
  const memo = getInputValue("event-memo");
  const hasScheduledYear = scheduledYearText !== "";
  const hasTargetAge = targetAgeText !== "";

  if (!name) {
    showMessage("イベント名を入力してください", "error");
    return;
  }

  if (amount <= 0) {
    showMessage("金額は1円以上で入力してください", "error");
    return;
  }

  if (!hasScheduledYear && !hasTargetAge) {
    showMessage("予定年または対象者の年齢を入力してください", "error");
    return;
  }

  if (!targetFamilyId && hasTargetAge && !hasScheduledYear) {
    showMessage("対象者の年齢で登録する場合は、対象者を選択してください", "error");
    return;
  }

  const eventValues = {
    id: editingEventId || createId("event"),
    name: name,
    targetFamilyId: targetFamilyId,
    scheduledYear: hasScheduledYear ? getInputNumber("event-scheduled-year") : null,
    targetAge: targetFamilyId && hasTargetAge ? getInputNumber("event-target-age") : null,
    amount: amount,
    category: category,
    memo: memo
  };

  if (!lifePlanData.events || !Array.isArray(lifePlanData.events)) {
    lifePlanData.events = [];
  }

  if (editingEventId) {
    const targetEvent = lifePlanData.events.find(function (lifeEvent) {
      return lifeEvent.id === editingEventId;
    });

    if (!targetEvent) {
      showMessage("更新するイベントが見つかりません", "error");
      return;
    }

    targetEvent.name = eventValues.name;
    targetEvent.targetFamilyId = eventValues.targetFamilyId;
    targetEvent.scheduledYear = eventValues.scheduledYear;
    targetEvent.targetAge = eventValues.targetAge;
    targetEvent.amount = eventValues.amount;
    targetEvent.category = eventValues.category;
    targetEvent.memo = eventValues.memo;

    const saved = saveData();
    editingEventId = null;
    renderAll();

    if (saved) {
      showMessage("イベントを更新しました", "success");
    }

    return;
  }

  lifePlanData.events.push(eventValues);

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("イベントを追加しました", "success");
  }
}

// 資産・収入・支出の編集フォームを表示します。
function renderFinanceForm() {
  const formArea = getElement("finance-form-area");

  if (!formArea || !lifePlanData) {
    return;
  }

  clearElement(formArea);

  const assets = lifePlanData.assets || {};
  const income = lifePlanData.income || {};
  const expenses = lifePlanData.expenses || {};
  const mortgage = lifePlanData.mortgage || {};
  const form = document.createElement("form");
  const buttonRow = document.createElement("div");
  const submitButton = document.createElement("button");
  const panel = createFormPanel(formArea, "financeForm");

  form.id = "finance-form";
  form.addEventListener("submit", handleFinanceFormSubmit);
  form.appendChild(createTextElement("h3", "list-title", "資産・収入・支出を編集"));
  form.appendChild(createTextElement("p", "list-memo", getBaseYearDescription(lifePlanData.settings || {})));

  appendFinanceItemEditorSection(form, {
    title: "現金預金",
    listId: "finance-cash-accounts-list",
    totalId: "finance-cash-accounts-total",
    itemPrefix: "cash",
    addButtonText: "口座を追加",
    items: assets.cashAccounts,
    note: "口座名・金額・メモを入力できます。現金預金合計を総資産計算に使います。"
  });

  appendFinanceItemEditorSection(form, {
    title: "投資資産",
    listId: "finance-investment-items-list",
    totalId: "finance-investment-items-total",
    itemPrefix: "investment",
    addButtonText: "投資項目を追加",
    items: assets.investmentItems,
    note: "日本株式・米国株式・投資信託などの内訳を入力できます。投資資産合計を総資産計算に使います。"
  });

  appendFinanceFormGroup(form, "その他資産・負債", [
    { id: "finance-assets-insurance", label: "保険解約返戻金", value: assets.insurance },
    { id: "finance-assets-other-assets", label: "その他資産", value: assets.otherAssets },
    { id: "finance-assets-liabilities", label: "負債", value: assets.liabilities }
  ]);

  appendFinanceFormGroup(form, "収入", [
    { id: "finance-income-salary", label: "手取り年収", value: income.salary },
    { id: "finance-income-bonus", label: "賞与", value: income.bonus },
    { id: "finance-income-allowance", label: "手当", value: income.allowance },
    { id: "finance-income-other-income", label: "その他収入", value: income.otherIncome }
  ]);

  appendFinanceItemEditorSection(form, {
    title: "毎月支出",
    listId: "finance-monthly-items-list",
    totalId: "finance-monthly-items-total",
    annualizedId: "finance-monthly-items-annualized-total",
    itemPrefix: "monthly",
    addButtonText: "毎月支出を追加",
    items: expenses.monthlyItems,
    note: "住宅ローン残高推移の毎月返済額とは別管理です。必要に応じて同じ金額にしてください。通常支出は毎月支出合計×12に毎年支出を加えて計算します。"
  });

  appendFinanceItemEditorSection(form, {
    title: "毎年支出",
    listId: "finance-annual-items-list",
    totalId: "finance-annual-items-total",
    itemPrefix: "annual",
    addButtonText: "毎年支出を追加",
    items: expenses.annualItems,
    note: "固都税・自動車税など、年1回程度の支出を入力します。"
  });

  appendFinanceFormGroup(
    form,
    "住宅ローン設定",
    [
      { id: "mortgage-current-balance", label: "住宅ローン現在残高", value: mortgage.currentBalance },
      {
        id: "mortgage-annual-interest-rate",
        label: "住宅ローン金利",
        value: mortgage.annualInterestRate,
        step: "0.01",
        min: "0",
        inputMode: "decimal"
      },
      { id: "mortgage-monthly-payment", label: "毎月返済額", value: mortgage.monthlyPayment }
    ],
    "住宅ローン残高は金利・毎月返済額から概算計算しています。金融機関の返済予定表とは一致しない場合があります。"
  );

  buttonRow.className = "button-row";
  submitButton.type = "submit";
  submitButton.className = "primary-button";
  submitButton.textContent = "資産・収入・支出を保存";
  buttonRow.appendChild(submitButton);
  form.appendChild(buttonRow);
  panel.appendChild(form);
  updateFinanceItemTotals();
  applyFormPanelState("financeForm");
}

// フォーム送信時に入力値をデータへ反映します。
function handleFinanceFormSubmit(event) {
  event.preventDefault();

  if (!lifePlanData) {
    lifePlanData = getInitialDataCopy();
  }

  const cashAccounts = collectFinanceItems("finance-cash-accounts-list", "cash");
  const investmentItems = collectFinanceItems("finance-investment-items-list", "investment");
  const monthlyItems = collectFinanceItems("finance-monthly-items-list", "monthly");
  const annualItems = collectFinanceItems("finance-annual-items-list", "annual");

  lifePlanData.assets = Object.assign({}, lifePlanData.assets || {}, {
    cashAccounts: cashAccounts,
    investmentItems: investmentItems,
    insurance: getInputNumber("finance-assets-insurance"),
    otherAssets: getInputNumber("finance-assets-other-assets"),
    liabilities: getInputNumber("finance-assets-liabilities")
  });

  lifePlanData.income = {
    salary: getInputNumber("finance-income-salary"),
    bonus: getInputNumber("finance-income-bonus"),
    allowance: getInputNumber("finance-income-allowance"),
    otherIncome: getInputNumber("finance-income-other-income"),
    yearlyChanges: Array.isArray(lifePlanData.income && lifePlanData.income.yearlyChanges)
      ? lifePlanData.income.yearlyChanges
      : []
  };

  lifePlanData.expenses = Object.assign({}, lifePlanData.expenses || {}, {
    monthlyItems: monthlyItems,
    annualItems: annualItems
  });

  lifePlanData.mortgage = {
    currentBalance: getInputNumber("mortgage-current-balance"),
    annualInterestRate: getInputNumber("mortgage-annual-interest-rate"),
    monthlyPayment: getInputNumber("mortgage-monthly-payment")
  };
  lifePlanData.assets.liabilities = lifePlanData.mortgage.currentBalance;
  syncLegacyFinanceFields(lifePlanData);

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("資産・収入・支出を更新しました", "success");
  }
}

// NISA枠管理セクションを資産設定とドル建終身保険の間に用意します。
function ensureNisaSection() {
  let section = getElement("nisa-section");

  if (section) {
    return section;
  }

  section = document.createElement("section");
  section.id = "nisa-section";
  section.setAttribute("aria-labelledby", "nisa-heading");

  const heading = createTextElement("h2", "", "NISA枠管理");
  const contentArea = document.createElement("div");

  heading.id = "nisa-heading";
  contentArea.id = "nisa-content-area";
  section.appendChild(heading);
  section.appendChild(contentArea);

  const dollarInsuranceSection = getElement("dollar-insurance-section");
  const chartSection = getElement("asset-chart-section");
  const financeSection = getElement("finance-section");
  const main = document.querySelector ? document.querySelector("main") : document.body;

  if (dollarInsuranceSection && dollarInsuranceSection.parentNode) {
    dollarInsuranceSection.parentNode.insertBefore(section, dollarInsuranceSection);
  } else if (chartSection && chartSection.parentNode) {
    chartSection.parentNode.insertBefore(section, chartSection);
  } else if (financeSection && financeSection.parentNode) {
    financeSection.parentNode.insertBefore(section, financeSection.nextSibling);
  } else if (main) {
    main.appendChild(section);
  }

  return section;
}

// NISA管理枠に紐づく家族名を返します。
function getNisaMemberDisplayName(member) {
  const family = Array.isArray(lifePlanData && lifePlanData.family)
    ? lifePlanData.family
    : [];
  const familyMember = family.find(function (candidate) {
    return candidate.id === member.familyMemberId;
  });

  return familyMember ? familyMember.name : member.fallbackName || "未選択";
}

// NISA管理枠IDから対象データを取得します。
function getNisaMemberById(memberId) {
  const members =
    lifePlanData &&
    lifePlanData.nisaManagement &&
    Array.isArray(lifePlanData.nisaManagement.members)
      ? lifePlanData.nisaManagement.members
      : [];

  return members.find(function (member) {
    return member.id === memberId;
  }) || null;
}

// NISAサマリー用に現在年または最新年の計算結果を選びます。
function getNisaSummaryRow(member) {
  const schedule = calculateNisaMemberSchedule(member.records, NISA_RULES);
  const currentYear = Math.max(NISA_RULES.startYear, new Date().getFullYear());
  const currentYearRow = schedule.find(function (row) {
    return row.year === currentYear;
  });

  if (currentYearRow) {
    return currentYearRow;
  }

  if (schedule.length > 0) {
    return schedule[schedule.length - 1];
  }

  return calculateNisaMemberSchedule([
    {
      id: "nisa-summary-empty",
      year: currentYear,
      tsumitatePurchaseAmount: 0,
      growthPurchaseAmount: 0,
      tsumitateSoldBookValue: 0,
      growthSoldBookValue: 0,
      memo: ""
    }
  ], NISA_RULES)[0];
}

// NISA制度の固定値と注意点を表示します。
function renderNisaRulesNotice(container) {
  const notice = document.createElement("div");
  const list = document.createElement("ul");
  const notes = [
    "2024年以降のNISAを対象とします。",
    "年間投資枠は、つみたて120万円・成長240万円、合計360万円です。",
    "生涯総枠は1,800万円、うち成長投資枠は1,200万円です。",
    "売却した取得簿価分は翌年以降に再利用できますが、売却した年の年間投資枠は戻りません。",
    "売却簿価には売却代金ではなく、NISAで取得したときの金額を入力してください。",
    "本機能は枠管理の参考値です。最終的には証券会社の表示を優先してください。",
    "NISAの買付額や簿価残高は、二重計上防止のため総資産へ自動加算しません。"
  ];

  notice.className = "nisa-rules-note";
  notes.forEach(function (note) {
    const item = document.createElement("li");
    item.textContent = note;
    list.appendChild(item);
  });
  notice.appendChild(list);
  container.appendChild(notice);
}

// 人物別NISAサマリーの1項目を追加します。
function appendNisaSummaryItem(container, label, value, groupClass) {
  const item = document.createElement("div");
  const labelElement = createTextElement("span", "nisa-summary-label", label);
  const valueElement = createTextElement("strong", "nisa-summary-value", value);

  item.className = `nisa-summary-item ${groupClass || ""}`.trim();
  item.appendChild(labelElement);
  item.appendChild(valueElement);
  container.appendChild(item);
}

// 1人分のNISA対象者選択欄を表示します。
function renderNisaMemberSelector(container, member, memberIndex) {
  const family = Array.isArray(lifePlanData.family) ? lifePlanData.family : [];
  const options = [{ value: "", label: "未選択" }].concat(
    family.map(function (familyMember) {
      return {
        value: familyMember.id,
        label: `${familyMember.name}（${familyMember.relationship || "続柄未設定"}）`
      };
    })
  );
  const row = document.createElement("div");
  const selectField = createSelectField(
    `nisa-target-${member.id}`,
    `${memberIndex + 1}人目の対象者`,
    options,
    member.familyMemberId
  );
  const saveButton = document.createElement("button");

  row.className = "nisa-member-selector";
  saveButton.type = "button";
  saveButton.className = "secondary-button small-button";
  saveButton.textContent = "対象者を保存";
  saveButton.addEventListener("click", function () {
    handleNisaMemberSelection(member.id);
  });

  row.appendChild(selectField);
  row.appendChild(saveButton);
  container.appendChild(row);
}

// NISA対象者を保存し、2枠への同一家族登録を防ぎます。
function handleNisaMemberSelection(memberId) {
  const member = getNisaMemberById(memberId);
  const selectedFamilyMemberId = getInputValue(`nisa-target-${memberId}`);

  if (!member) {
    showMessage("NISA管理対象者が見つかりません", "error");
    return;
  }

  const duplicateMember = lifePlanData.nisaManagement.members.find(function (candidate) {
    return (
      candidate.id !== memberId &&
      selectedFamilyMemberId &&
      candidate.familyMemberId === selectedFamilyMemberId
    );
  });

  if (duplicateMember) {
    showMessage("同じ家族を2つのNISA管理枠に設定することはできません", "error");
    return;
  }

  member.familyMemberId = selectedFamilyMemberId;
  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("NISA管理対象者を更新しました", "success");
  }
}

// 1人分の最新NISAサマリーを表示します。
function renderNisaMemberSummary(container, member) {
  const summaryRow = getNisaSummaryRow(member);
  const summary = document.createElement("div");
  const heading = createTextElement(
    "h4",
    "nisa-summary-heading",
    `${summaryRow.year}年の枠状況`
  );

  summary.className = "nisa-summary";
  summary.appendChild(heading);

  const summaryGrid = document.createElement("div");
  summaryGrid.className = "nisa-summary-grid";

  appendNisaSummaryItem(summaryGrid, "対象者", getNisaMemberDisplayName(member), "nisa-summary-person");
  appendNisaSummaryItem(summaryGrid, "当年つみたて投資額", formatYen(summaryRow.tsumitatePurchaseAmount), "nisa-summary-annual");
  appendNisaSummaryItem(summaryGrid, "当年つみたて年間残り", formatYen(summaryRow.annualTsumitateRemaining), "nisa-summary-annual");
  appendNisaSummaryItem(summaryGrid, "当年成長投資額", formatYen(summaryRow.growthPurchaseAmount), "nisa-summary-annual");
  appendNisaSummaryItem(summaryGrid, "当年成長年間残り", formatYen(summaryRow.annualGrowthRemaining), "nisa-summary-annual");
  appendNisaSummaryItem(summaryGrid, "当年買付合計", formatYen(summaryRow.purchaseTotal), "nisa-summary-annual");
  appendNisaSummaryItem(summaryGrid, "当年年間残り合計", formatYen(summaryRow.annualTotalRemaining), "nisa-summary-annual");
  appendNisaSummaryItem(summaryGrid, "年末つみたて簿価", formatYen(summaryRow.endTsumitateBookValue), "nisa-summary-book");
  appendNisaSummaryItem(summaryGrid, "年末成長簿価", formatYen(summaryRow.endGrowthBookValue), "nisa-summary-book");
  appendNisaSummaryItem(summaryGrid, "年末総簿価", formatYen(summaryRow.endTotalBookValue), "nisa-summary-book");
  appendNisaSummaryItem(summaryGrid, "当年売却簿価合計", formatYen(summaryRow.soldBookValueTotal), "nisa-summary-restoration");
  appendNisaSummaryItem(summaryGrid, "翌年復活予定額", formatYen(summaryRow.nextYearRestorationAmount), "nisa-summary-restoration");
  appendNisaSummaryItem(summaryGrid, "翌年利用可能な生涯総枠", formatYen(summaryRow.nextYearLifetimeTotalRemaining), "nisa-summary-lifetime");
  appendNisaSummaryItem(summaryGrid, "翌年利用可能な成長生涯枠", formatYen(summaryRow.nextYearLifetimeGrowthRemaining), "nisa-summary-lifetime");

  summary.appendChild(summaryGrid);
  container.appendChild(summary);
}

// NISA年次記録の新規入力で使う初期年を返します。
function getDefaultNisaRecordYear(member) {
  const usedYears = new Set(
    (Array.isArray(member.records) ? member.records : []).map(function (record) {
      return toNumber(record.year);
    })
  );
  let year = Math.max(NISA_RULES.startYear, new Date().getFullYear());

  while (usedYears.has(year)) {
    year += 1;
  }

  return year;
}

// 1人分のNISA年次記録フォームを表示します。
function renderNisaRecordForm(container, member) {
  const editingRecordId = editingNisaRecordIds[member.id] || null;
  const editingRecord = editingRecordId
    ? member.records.find(function (record) {
        return record.id === editingRecordId;
      })
    : null;
  const record = editingRecord || {
    year: getDefaultNisaRecordYear(member),
    tsumitatePurchaseAmount: 0,
    growthPurchaseAmount: 0,
    tsumitateSoldBookValue: 0,
    growthSoldBookValue: 0,
    memo: ""
  };
  const form = document.createElement("form");
  const grid = document.createElement("div");
  const buttonRow = document.createElement("div");
  const submitButton = document.createElement("button");
  const cancelButton = document.createElement("button");
  const fieldPrefix = `nisa-${member.id}`;

  form.className = "nisa-record-form";
  form.dataset.memberId = member.id;
  form.addEventListener("submit", function (event) {
    handleNisaRecordSubmit(event, member.id);
  });
  form.appendChild(createTextElement(
    "h4",
    "list-title",
    editingRecord ? "年次記録を編集" : "年次記録を追加"
  ));

  grid.className = "form-grid nisa-record-form-grid";
  [
    createNumberField(`${fieldPrefix}-year`, "年", record.year, "1", NISA_RULES.startYear, "numeric"),
    createNumberField(`${fieldPrefix}-tsumitate-purchase`, "つみたて買付額", record.tsumitatePurchaseAmount, "1", "0", "numeric"),
    createNumberField(`${fieldPrefix}-growth-purchase`, "成長買付額", record.growthPurchaseAmount, "1", "0", "numeric"),
    createNumberField(`${fieldPrefix}-tsumitate-sold`, "つみたて売却簿価", record.tsumitateSoldBookValue, "1", "0", "numeric"),
    createNumberField(`${fieldPrefix}-growth-sold`, "成長売却簿価", record.growthSoldBookValue, "1", "0", "numeric"),
    createTextareaField(`${fieldPrefix}-memo`, "メモ", record.memo)
  ].forEach(function (field) {
    grid.appendChild(field);
  });

  const yearInput = getElement(`${fieldPrefix}-year`) || grid.querySelector(`#${fieldPrefix}-year`);
  if (yearInput) {
    yearInput.required = true;
  }

  form.appendChild(grid);
  form.appendChild(createTextElement(
    "p",
    "list-memo nisa-sold-note",
    "売却金額ではなく、その商品をNISAで取得したときの金額を入力してください。"
  ));

  buttonRow.className = "button-row";
  submitButton.type = "submit";
  submitButton.className = "primary-button small-button";
  submitButton.textContent = editingRecord ? "年次記録を更新" : "年次記録を追加";
  buttonRow.appendChild(submitButton);

  if (editingRecord) {
    cancelButton.type = "button";
    cancelButton.className = "secondary-button small-button";
    cancelButton.textContent = "編集をキャンセル";
    cancelButton.addEventListener("click", function () {
      cancelEditNisaRecord(member.id);
    });
    buttonRow.appendChild(cancelButton);
  }

  form.appendChild(buttonRow);
  container.appendChild(form);
}

// NISA年次記録の入力値を取得します。
function getNisaRecordInput(memberId, recordId) {
  const fieldPrefix = `nisa-${memberId}`;

  return {
    id: recordId || createId("nisa-record"),
    year: getInputNumber(`${fieldPrefix}-year`),
    tsumitatePurchaseAmount: getInputNumber(`${fieldPrefix}-tsumitate-purchase`),
    growthPurchaseAmount: getInputNumber(`${fieldPrefix}-growth-purchase`),
    tsumitateSoldBookValue: getInputNumber(`${fieldPrefix}-tsumitate-sold`),
    growthSoldBookValue: getInputNumber(`${fieldPrefix}-growth-sold`),
    memo: getInputValue(`${fieldPrefix}-memo`)
  };
}

// NISA年次記録を追加または更新します。
function handleNisaRecordSubmit(event, memberId) {
  event.preventDefault();

  const member = getNisaMemberById(memberId);
  const editingRecordId = editingNisaRecordIds[memberId] || null;

  if (!member) {
    showMessage("NISA管理対象者が見つかりません", "error");
    return;
  }

  const recordValues = getNisaRecordInput(memberId, editingRecordId);
  const candidateRecords = member.records
    .filter(function (record) {
      return record.id !== editingRecordId;
    })
    .concat(recordValues);
  const validation = validateNisaMemberRecords(candidateRecords, NISA_RULES);

  if (!validation.isValid) {
    showMessage(validation.message, "error");
    return;
  }

  member.records = normalizeNisaRecords(candidateRecords, 0);
  delete editingNisaRecordIds[memberId];

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage(
      editingRecordId ? "NISA年次記録を更新しました" : "NISA年次記録を追加しました",
      "success"
    );
  }
}

// NISA年次記録の編集を開始します。
function startEditNisaRecord(memberId, recordId) {
  const member = getNisaMemberById(memberId);
  const record = member && member.records.find(function (candidate) {
    return candidate.id === recordId;
  });

  if (!record) {
    showMessage("編集するNISA年次記録が見つかりません", "error");
    return;
  }

  editingNisaRecordIds[memberId] = recordId;
  renderNisaSection();

  const form = getElement(`nisa-member-card-${memberId}`);
  if (form && typeof form.scrollIntoView === "function") {
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  showMessage(`${record.year}年のNISA記録を編集できます`, "success");
}

// NISA年次記録の編集をキャンセルします。
function cancelEditNisaRecord(memberId) {
  delete editingNisaRecordIds[memberId];
  renderNisaSection();
  showMessage("NISA年次記録の編集をキャンセルしました", "success");
}

// NISA年次記録を削除し、以後の枠を再計算します。
function handleDeleteNisaRecord(memberId, recordId) {
  const member = getNisaMemberById(memberId);
  const record = member && member.records.find(function (candidate) {
    return candidate.id === recordId;
  });

  if (!record) {
    showMessage("削除するNISA年次記録が見つかりません", "error");
    return;
  }

  const shouldDelete = confirm(
    `${record.year}年のNISA記録を削除しますか？この年以降の残り枠計算が変わります。`
  );

  if (!shouldDelete) {
    return;
  }

  member.records = member.records.filter(function (candidate) {
    return candidate.id !== recordId;
  });

  if (editingNisaRecordIds[memberId] === recordId) {
    delete editingNisaRecordIds[memberId];
  }

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("NISA年次記録を削除しました", "success");
  }
}

// 1人分のNISA年次一覧を表示します。
function renderNisaRecords(container, member) {
  const schedule = calculateNisaMemberSchedule(member.records, NISA_RULES);
  const heading = createTextElement("h4", "list-title", "年次記録");
  const scroll = document.createElement("div");
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  const body = document.createElement("tbody");
  const headers = [
    "年",
    "つみたて買付",
    "成長買付",
    "買付合計",
    "つみたて売却簿価",
    "成長売却簿価",
    "年末総簿価",
    "当年年間残り",
    "翌年総枠残り",
    "翌年成長枠残り",
    "メモ",
    "操作"
  ];

  container.appendChild(heading);

  if (schedule.length === 0) {
    container.appendChild(createTextElement(
      "p",
      "list-meta",
      "年次記録はまだありません。2024年以降の記録を追加してください。"
    ));
    renderNisaRecordForm(container, member);
    return;
  }

  scroll.className = "table-scroll nisa-table-scroll";
  table.className = "nisa-record-table";

  headers.forEach(function (header) {
    appendTableHeaderCell(headRow, header);
  });
  head.appendChild(headRow);

  schedule.forEach(function (row) {
    const tableRow = document.createElement("tr");
    const actionCell = document.createElement("td");
    const actionRow = document.createElement("div");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    appendTableCell(tableRow, String(row.year));
    appendTableCell(tableRow, formatYen(row.tsumitatePurchaseAmount), "number-cell");
    appendTableCell(tableRow, formatYen(row.growthPurchaseAmount), "number-cell");
    appendTableCell(tableRow, formatYen(row.purchaseTotal), "number-cell");
    appendTableCell(tableRow, formatYen(row.tsumitateSoldBookValue), "number-cell");
    appendTableCell(tableRow, formatYen(row.growthSoldBookValue), "number-cell");
    appendTableCell(tableRow, formatYen(row.endTotalBookValue), "number-cell");
    appendTableCell(tableRow, formatYen(row.annualTotalRemaining), "number-cell");
    appendTableCell(tableRow, formatYen(row.nextYearLifetimeTotalRemaining), "number-cell");
    appendTableCell(tableRow, formatYen(row.nextYearLifetimeGrowthRemaining), "number-cell");
    appendTableCell(tableRow, row.memo || "-");

    actionRow.className = "nisa-record-actions";
    editButton.type = "button";
    editButton.className = "secondary-button nisa-action-button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", function () {
      startEditNisaRecord(member.id, row.id);
    });

    deleteButton.type = "button";
    deleteButton.className = "danger-button nisa-action-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", function () {
      handleDeleteNisaRecord(member.id, row.id);
    });

    actionRow.appendChild(editButton);
    actionRow.appendChild(deleteButton);
    actionCell.appendChild(actionRow);
    tableRow.appendChild(actionCell);
    body.appendChild(tableRow);
  });

  table.appendChild(head);
  table.appendChild(body);
  scroll.appendChild(table);
  container.appendChild(scroll);
  renderNisaRecordForm(container, member);
}

// 本人・配偶者の2人分を分けてNISA枠管理画面へ表示します。
function renderNisaSection() {
  const section = ensureNisaSection();
  const contentArea = getElement("nisa-content-area");

  if (!section || !contentArea || !lifePlanData) {
    return;
  }

  ensureNisaManagementShape(lifePlanData);
  clearElement(contentArea);
  renderNisaRulesNotice(contentArea);

  const members = lifePlanData.nisaManagement.members;
  members.forEach(function (member, memberIndex) {
    const card = document.createElement("article");
    const title = createTextElement(
      "h3",
      "nisa-member-title",
      `${memberIndex + 1}人目: ${getNisaMemberDisplayName(member)}`
    );

    card.id = `nisa-member-card-${member.id}`;
    card.className = "nisa-member-card";
    card.appendChild(title);
    renderNisaMemberSelector(card, member, memberIndex);
    renderNisaMemberSummary(card, member);
    renderNisaRecords(card, member);
    contentArea.appendChild(card);
  });
}

// ドル建終身保険セクションを画面に用意します。
function ensureDollarInsuranceSection() {
  let section = getElement("dollar-insurance-section");

  if (section) {
    return section;
  }

  section = document.createElement("section");
  section.id = "dollar-insurance-section";
  section.setAttribute("aria-labelledby", "dollar-insurance-heading");
  section.appendChild(createTextElement("h2", "", "ドル建終身保険"));

  const heading = section.querySelector ? section.querySelector("h2") : null;
  if (heading) {
    heading.id = "dollar-insurance-heading";
  }

  const summary = document.createElement("div");
  const formArea = document.createElement("div");
  const chart = document.createElement("div");

  summary.id = "dollar-insurance-summary";
  formArea.id = "dollar-insurance-form-area";
  chart.id = "dollar-insurance-chart";

  section.appendChild(summary);
  section.appendChild(formArea);
  section.appendChild(chart);

  const chartSection = getElement("asset-chart-section");
  const main = document.querySelector ? document.querySelector("main") : document.body;

  if (chartSection && chartSection.parentNode) {
    chartSection.parentNode.insertBefore(section, chartSection);
  } else if (main) {
    main.appendChild(section);
  }

  return section;
}

// ドル建終身保険の現在・最終サマリーを作ります。
function getDollarInsuranceSummary(data) {
  const insurance = data && data.dollarInsurance ? data.dollarInsurance : {};
  const family = Array.isArray(data && data.family) ? data.family : [];
  const schedule = Array.isArray(insurance.schedule) ? insurance.schedule : [];
  const targetFamily = family.find(function (member) {
    return member.id === insurance.targetFamilyMemberId;
  });
  const startYear = toNumber(data && data.settings && data.settings.startYear);
  const currentAge = targetFamily ? calculateAgeInYear(targetFamily.birthDate, startYear) : null;
  const currentRow = currentAge === null ? null : findDollarInsuranceRowByAge(data, currentAge);
  const finalRow = schedule.length > 0 ? schedule[schedule.length - 1] : null;
  const exchangeRate = toNumber(insurance.exchangeRate);

  return {
    exchangeRate: exchangeRate,
    targetName: targetFamily ? targetFamily.name : "未選択",
    currentAge: currentAge,
    currentRow: currentRow,
    currentCumulativePremiumUsd: currentRow ? toNumber(currentRow.cumulativePremiumUsd) : 0,
    currentCumulativePremiumJpy: currentRow ? toNumber(currentRow.cumulativePremiumUsd) * exchangeRate : 0,
    currentCashValueUsd: currentRow ? toNumber(currentRow.cashValueUsd) : 0,
    currentCashValueJpy: currentRow ? toNumber(currentRow.cashValueUsd) * exchangeRate : 0,
    finalAge: finalRow ? toNumber(finalRow.age) : null,
    finalCumulativePremiumUsd: finalRow ? toNumber(finalRow.cumulativePremiumUsd) : 0,
    finalCumulativePremiumJpy: finalRow ? toNumber(finalRow.cumulativePremiumUsd) * exchangeRate : 0,
    finalCashValueUsd: finalRow ? toNumber(finalRow.cashValueUsd) : 0,
    finalCashValueJpy: finalRow ? toNumber(finalRow.cashValueUsd) * exchangeRate : 0,
    returnRate: currentRow ? toNumber(currentRow.returnRate) : finalRow ? toNumber(finalRow.returnRate) : 0
  };
}

// ドル建終身保険のサマリーを表示します。
function renderDollarInsuranceSummary() {
  const summaryArea = getElement("dollar-insurance-summary");

  if (!summaryArea || !lifePlanData) {
    return;
  }

  clearElement(summaryArea);

  const insurance = lifePlanData.dollarInsurance || {};
  const summary = getDollarInsuranceSummary(lifePlanData);
  const currentPremiumUsdText = summary.currentRow ? formatUsd(summary.currentCumulativePremiumUsd) : "該当なし";
  const currentPremiumJpyText = summary.currentRow ? formatYen(summary.currentCumulativePremiumJpy) : "該当なし";
  const currentUsdText = summary.currentRow ? formatUsd(summary.currentCashValueUsd) : "該当なし";
  const currentJpyText = summary.currentRow ? formatYen(summary.currentCashValueJpy) : "該当なし";
  const finalPremiumUsdText = summary.finalAge === null ? "該当なし" : formatUsd(summary.finalCumulativePremiumUsd);
  const finalPremiumJpyText = summary.finalAge === null ? "該当なし" : formatYen(summary.finalCumulativePremiumJpy);
  const finalUsdText = summary.finalAge === null ? "該当なし" : formatUsd(summary.finalCashValueUsd);
  const finalJpyText = summary.finalAge === null ? "該当なし" : formatYen(summary.finalCashValueJpy);
  const card = document.createElement("article");

  card.className = "list-card";
  card.appendChild(createTextElement("h3", "list-title", insurance.policyName || "米国ドル建終身保険"));
  [
    `対象者: ${summary.targetName}`,
    `想定為替レート: 1 USD = ${summary.exchangeRate.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`,
    `現在年齢: ${summary.currentAge === null ? "未設定" : `${summary.currentAge}歳`}`,
    `現在年齢に対応する払込累計額USD（参考）: ${currentPremiumUsdText}`,
    `現在年齢に対応する払込累計額円換算（総資産外）: ${currentPremiumJpyText}`,
    `現在年齢に対応する解約返戻金USD（参考）: ${currentUsdText}`,
    `現在年齢に対応する解約返戻金円換算（総資産外）: ${currentJpyText}`,
    `最終年齢の払込累計額USD（参考）: ${summary.finalAge === null ? "該当なし" : `${summary.finalAge}歳 / ${finalPremiumUsdText}`}`,
    `最終年齢の払込累計額円換算（総資産外）: ${finalPremiumJpyText}`,
    `最終年齢の解約返戻金USD（参考）: ${summary.finalAge === null ? "該当なし" : `${summary.finalAge}歳 / ${finalUsdText}`}`,
    `最終年齢の解約返戻金円換算（総資産外）: ${finalJpyText}`,
    `返戻率: ${formatPercent(summary.returnRate)}`
  ].forEach(function (text) {
    card.appendChild(createTextElement("p", "list-meta", text));
  });
  card.appendChild(
    createTextElement(
      "p",
      "list-memo",
      "このドル建終身保険の払込累計額・解約返戻金は、総資産・純資産・年末資産見込みには含めていません。総資産外の参考情報として表示しています。"
    )
  );

  if (insurance.memo) {
    card.appendChild(createTextElement("p", "list-memo", `メモ: ${insurance.memo}`));
  }

  summaryArea.appendChild(card);
}

// ドル建終身保険フォームを表示します。
function renderDollarInsuranceForm() {
  const formArea = getElement("dollar-insurance-form-area");

  if (!formArea || !lifePlanData) {
    return;
  }

  clearElement(formArea);

  const insurance = lifePlanData.dollarInsurance || {};
  const family = Array.isArray(lifePlanData.family) ? lifePlanData.family : [];
  const form = document.createElement("form");
  const grid = document.createElement("div");
  const buttonRow = document.createElement("div");
  const submitButton = document.createElement("button");
  const scheduleField = document.createElement("div");
  const scheduleLabel = document.createElement("label");
  const scheduleTextarea = document.createElement("textarea");
  const panel = createFormPanel(formArea, "dollarInsuranceForm");
  const familyOptions = [
    {
      value: "",
      label: "対象者を選択"
    }
  ].concat(
    family.map(function (member) {
      return {
        value: member.id,
        label: member.name || "名前未設定"
      };
    })
  );

  form.id = "dollar-insurance-form";
  form.addEventListener("submit", handleDollarInsuranceFormSubmit);
  grid.className = "form-grid";

  grid.appendChild(createTextField("dollar-insurance-policy-name", "保険名", true, insurance.policyName || ""));
  grid.appendChild(createSelectField("dollar-insurance-target-family", "対象者", familyOptions, insurance.targetFamilyMemberId || ""));
  grid.appendChild(
    createNumberField("dollar-insurance-exchange-rate", "想定為替レート", insurance.exchangeRate, "0.01", "0", "decimal")
  );
  grid.appendChild(createTextareaField("dollar-insurance-memo", "メモ", insurance.memo || ""));

  scheduleField.className = "form-field full-width-field";
  scheduleLabel.htmlFor = "dollar-insurance-schedule-text";
  scheduleLabel.textContent = "解約返戻金推移データ";
  scheduleTextarea.id = "dollar-insurance-schedule-text";
  scheduleTextarea.name = "dollar-insurance-schedule-text";
  scheduleTextarea.rows = 12;
  scheduleTextarea.placeholder =
    "保険年度,年齢,払込保険料累計USD,死亡保険金USD,解約返戻金USD,返戻率%,払済保険金USD,経過保険期間\n1,27,2393.16,180000,0,0,0,\n2,28,4786.32,180000,0,0,0,";
  scheduleTextarea.value = insurance.scheduleText || "";
  scheduleField.appendChild(scheduleLabel);
  scheduleField.appendChild(scheduleTextarea);

  buttonRow.className = "button-row";
  submitButton.type = "submit";
  submitButton.className = "primary-button";
  submitButton.textContent = "ドル建終身保険を保存";
  buttonRow.appendChild(submitButton);

  form.appendChild(createTextElement("h3", "list-title", "ドル建終身保険を編集"));
  form.appendChild(grid);
  form.appendChild(scheduleField);
  form.appendChild(
    createTextElement(
      "p",
      "list-memo",
      "CSV風テキストはカンマ区切り・タブ区切りに対応します。この終身保険は総資産外の参考情報として扱い、総資産・純資産・年末資産見込みには自動反映しません。"
    )
  );
  form.appendChild(buttonRow);
  panel.appendChild(form);
  applyFormPanelState("dollarInsuranceForm");
}

// ドル建終身保険フォームの内容を保存します。
function handleDollarInsuranceFormSubmit(event) {
  event.preventDefault();

  if (!lifePlanData) {
    lifePlanData = getInitialDataCopy();
  }

  const policyName = getInputValue("dollar-insurance-policy-name") || "米国ドル建終身保険";
  const targetFamilyMemberId = getInputValue("dollar-insurance-target-family");
  const exchangeRate = getInputNumber("dollar-insurance-exchange-rate");
  const memo = getInputValue("dollar-insurance-memo");
  const scheduleText = getInputValue("dollar-insurance-schedule-text");
  const schedule = parseDollarInsuranceScheduleText(scheduleText);

  lifePlanData.dollarInsurance = {
    enabled: true,
    policyName: policyName,
    targetFamilyMemberId: targetFamilyMemberId,
    exchangeRate: exchangeRate,
    memo: memo,
    scheduleText: scheduleText,
    schedule: schedule
  };

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage(`ドル建終身保険を保存しました（${schedule.length}行）`, "success");
  }
}

// ドル建終身保険の簡易バーグラフを表示します。
function renderDollarInsuranceChart() {
  const chart = getElement("dollar-insurance-chart");

  if (!chart || !lifePlanData) {
    return;
  }

  clearElement(chart);

  const insurance = lifePlanData.dollarInsurance || {};
  const schedule = Array.isArray(insurance.schedule) ? insurance.schedule : [];
  const exchangeRate = toNumber(insurance.exchangeRate);

  if (schedule.length === 0) {
    chart.appendChild(createTextElement("p", "list-meta", "解約返戻金推移データはまだありません。"));
    return;
  }

  const chartList = document.createElement("div");
  const maxCashValue = schedule.reduce(function (maxValue, row) {
    return Math.max(maxValue, toNumber(row.cashValueUsd));
  }, 0);
  const chartMax = maxCashValue > 0 ? maxCashValue : 1;

  chartList.className = "chart-list dollar-insurance-chart-list";
  chart.appendChild(createTextElement("h3", "list-title", "解約返戻金推移"));

  schedule.forEach(function (row) {
    const chartRow = document.createElement("div");
    const barWrap = document.createElement("div");
    const bar = document.createElement("div");
    const cashValueUsd = toNumber(row.cashValueUsd);
    const widthPercent = Math.max(0, Math.min(100, (cashValueUsd / chartMax) * 100));

    chartRow.className = "chart-row";
    barWrap.className = "chart-bar-wrap";
    bar.className = "chart-bar";
    bar.style.width = `${widthPercent}%`;

    chartRow.appendChild(createTextElement("div", "chart-year", `${toNumber(row.age)}歳`));
    barWrap.appendChild(bar);
    chartRow.appendChild(barWrap);
    chartRow.appendChild(createTextElement("div", "chart-value", `${formatUsd(cashValueUsd)} / ${formatYen(cashValueUsd * exchangeRate)}`));
    chartList.appendChild(chartRow);
  });

  chart.appendChild(chartList);
}

// ドル建終身保険セクション全体を描画します。
function renderDollarInsuranceSection() {
  ensureDollarInsuranceSection();
  renderDollarInsuranceSummary();
  renderDollarInsuranceForm();
  renderDollarInsuranceChart();
}

// 表のセルを追加します。
function appendTableCell(row, text, className, isNegative) {
  const cell = document.createElement("td");

  if (className) {
    cell.className = className;
  }

  cell.textContent = text;
  setNegativeClass(cell, Boolean(isNegative));
  row.appendChild(cell);
  return cell;
}

// 表の見出しセルを追加します。
function appendTableHeaderCell(row, text, className) {
  const cell = document.createElement("th");
  cell.scope = "col";
  if (className) {
    cell.className = className;
  }
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

// 家族ごとに年齢列を分けた表ヘッダーを作ります。
function renderLifePlanTableHeader(table, family) {
  const tableHead = document.createElement("thead");
  const row = document.createElement("tr");

  appendTableHeaderCell(row, "年");

  if (isTableColumnVisible("familyAges")) {
    family.forEach(function (member) {
      appendTableHeaderCell(row, member.name || "名前未設定");
    });
  }

  appendTableHeaderCell(row, "イベント");

  if (isTableColumnVisible("eventExpenses")) {
    appendTableHeaderCell(row, "イベント支出");
  }

  if (isTableColumnVisible("income")) {
    appendTableHeaderCell(row, "年間収入");
  }

  if (isTableColumnVisible("regularExpenses")) {
    appendTableHeaderCell(row, "通常支出");
  }

  if (isTableColumnVisible("annualBalance")) {
    appendTableHeaderCell(row, "年間収支");
  }

  if (isTableColumnVisible("yearEndAssets")) {
    appendTableHeaderCell(row, "年初資産");
    appendTableHeaderCell(row, "年末資産");
  }

  if (isTableColumnVisible("mortgage")) {
    appendTableHeaderCell(row, "住宅ローン年初残高");
    appendTableHeaderCell(row, "住宅ローン年末残高");
    appendTableHeaderCell(row, "住宅ローン年間利息");
  }

  if (isTableColumnVisible("netAssets")) {
    appendTableHeaderCell(row, "純資産見込み");
  }

  if (isTableColumnVisible("dollarInsurance")) {
    appendTableHeaderCell(
      row,
      isCompactLifePlanTable() ? "払込USD" : "ドル建終身 払込累計USD（参考）",
      "dollar-insurance-column dollar-insurance-usd-column"
    );
    appendTableHeaderCell(
      row,
      isCompactLifePlanTable() ? "払込円" : "ドル建終身 払込累計円（総資産外）",
      "dollar-insurance-column dollar-insurance-yen-column"
    );
    appendTableHeaderCell(
      row,
      isCompactLifePlanTable() ? "返戻USD" : "ドル建終身 解約返戻金USD（参考）",
      "dollar-insurance-column dollar-insurance-usd-column"
    );
    appendTableHeaderCell(
      row,
      isCompactLifePlanTable() ? "返戻円" : "ドル建終身 解約返戻金円（総資産外）",
      "dollar-insurance-column dollar-insurance-yen-column"
    );
  }

  tableHead.appendChild(row);
  table.appendChild(tableHead);
  return tableHead;
}

// ライフプラン表の tbody を作ります。
function createLifePlanTableBody(table) {
  const tableBody = document.createElement("tbody");
  tableBody.id = "life-plan-table-body";
  table.appendChild(tableBody);
  return tableBody;
}

// ライフプラン表を表示します。
function renderLifePlanTable() {
  const table = getElement("life-plan-table");

  if (!table) {
    return;
  }

  const family = Array.isArray(lifePlanData && lifePlanData.family) ? lifePlanData.family : [];

  clearElement(table);
  table.classList.toggle("life-plan-table-compact", isCompactLifePlanTable());
  renderLifePlanTableHeader(table, family);
  const tableBody = createLifePlanTableBody(table);

  lifePlanResults.forEach(function (result) {
    const row = document.createElement("tr");
    const eventText =
      result.events.length > 0
        ? result.events
            .map(function (event) {
              return event.name;
            })
            .join(" / ")
        : "-";

    if (result.events.length > 0) {
      row.classList.add("event-row");
    }

    appendTableCell(row, `${result.year}年`);
    if (isTableColumnVisible("familyAges")) {
      family.forEach(function (member) {
        const ageInfo = result.familyAges.find(function (familyAge) {
          return familyAge.id === member.id;
        });
        const ageText = ageInfo && ageInfo.age !== null ? `${ageInfo.age}歳` : "-";
        appendTableCell(row, ageText);
      });
    }
    appendTableCell(row, eventText);

    if (isTableColumnVisible("eventExpenses")) {
      appendTableCell(row, formatYenForTable(result.eventExpenseTotal), "number-cell");
    }

    if (isTableColumnVisible("income")) {
      appendTableCell(row, formatYenForTable(result.annualIncome), "number-cell");
    }

    if (isTableColumnVisible("regularExpenses")) {
      appendTableCell(row, formatYenForTable(result.regularExpenses), "number-cell");
    }

    if (isTableColumnVisible("annualBalance")) {
      appendTableCell(row, formatYenForTable(result.annualBalance), "number-cell", result.annualBalance < 0);
    }

    if (isTableColumnVisible("yearEndAssets")) {
      appendTableCell(row, formatYenForTable(result.startAssets), "number-cell");
      appendTableCell(row, formatYenForTable(result.endAssets), "number-cell", result.endAssets < 0);
    }

    if (isTableColumnVisible("mortgage")) {
      appendTableCell(row, formatYenForTable(result.mortgageStartBalance), "number-cell");
      appendTableCell(row, formatYenForTable(result.mortgageEndBalance), "number-cell");
      appendTableCell(row, formatYenForTable(result.mortgageAnnualInterest), "number-cell");
    }

    if (isTableColumnVisible("netAssets")) {
      appendTableCell(row, formatYenForTable(result.estimatedNetAssets), "number-cell", result.estimatedNetAssets < 0);
    }

    if (isTableColumnVisible("dollarInsurance")) {
      appendTableCell(
        row,
        result.dollarInsuranceCumulativePremiumUsd > 0 ? formatUsdForTable(result.dollarInsuranceCumulativePremiumUsd) : "-",
        "number-cell dollar-insurance-table-cell dollar-insurance-column dollar-insurance-usd-column compact-dollar-insurance-cell"
      );
      appendTableCell(
        row,
        result.dollarInsuranceCumulativePremiumJpy > 0 ? formatYenForTable(result.dollarInsuranceCumulativePremiumJpy) : "-",
        "number-cell dollar-insurance-table-cell dollar-insurance-column dollar-insurance-yen-column compact-dollar-insurance-cell"
      );
      appendTableCell(
        row,
        result.dollarInsuranceCashValueUsd > 0 ? formatUsdForTable(result.dollarInsuranceCashValueUsd) : "-",
        "number-cell dollar-insurance-table-cell dollar-insurance-column dollar-insurance-usd-column compact-dollar-insurance-cell"
      );
      appendTableCell(
        row,
        result.dollarInsuranceCashValueJpy > 0 ? formatYenForTable(result.dollarInsuranceCashValueJpy) : "-",
        "number-cell dollar-insurance-table-cell dollar-insurance-column dollar-insurance-yen-column compact-dollar-insurance-cell"
      );
    }

    tableBody.appendChild(row);
  });
}

// 年末資産の簡易バーグラフを表示します。
function renderAssetChart() {
  const chart = getElement("asset-chart");

  if (!chart) {
    return;
  }

  clearElement(chart);

  const chartList = document.createElement("div");
  const maxPositiveAssets = lifePlanResults.reduce(function (maxValue, result) {
    return Math.max(maxValue, toNumber(result.endAssets));
  }, 0);
  const chartMax = maxPositiveAssets > 0 ? maxPositiveAssets : 1;

  chartList.className = "chart-list";

  lifePlanResults.forEach(function (result) {
    const row = document.createElement("div");
    const barWrap = document.createElement("div");
    const bar = document.createElement("div");
    const rawPercent = (toNumber(result.endAssets) / chartMax) * 100;
    const widthPercent = Math.max(0, Math.min(100, rawPercent));

    row.className = "chart-row";
    barWrap.className = "chart-bar-wrap";
    bar.className = "chart-bar";
    bar.style.width = `${widthPercent}%`;
    setNegativeClass(bar, result.endAssets < 0);

    row.appendChild(createTextElement("div", "chart-year", `${result.year}年`));
    barWrap.appendChild(bar);
    row.appendChild(barWrap);
    row.appendChild(createTextElement("div", "chart-value", formatYen(result.endAssets)));
    chartList.appendChild(row);
  });

  chart.appendChild(chartList);
}

// 日付を YYYY-MM-DD の文字列にします。
function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 読み込んだJSONが最低限のデータ構造を持っているか確認します。
function isValidLifePlanData(data) {
  return (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    data.settings !== null &&
    typeof data.settings === "object" &&
    Array.isArray(data.family) &&
    Array.isArray(data.events) &&
    data.assets !== null &&
    typeof data.assets === "object" &&
    data.income !== null &&
    typeof data.income === "object" &&
    data.expenses !== null &&
    typeof data.expenses === "object"
  );
}

// データ管理セクションにJSON操作UIを追加します。
function renderDataManagement() {
  const dataManagementSection = getElement("data-management-section");

  if (!dataManagementSection) {
    return;
  }

  let extraArea = getElement("data-management-extra");

  if (!extraArea) {
    extraArea = document.createElement("div");
    extraArea.id = "data-management-extra";
    dataManagementSection.appendChild(extraArea);
  }

  clearElement(extraArea);

  const description = createTextElement("p", "list-meta", "バックアップ用にJSONファイルを書き出し・読み込みできます");
  const buttonRow = document.createElement("div");
  const exportButton = document.createElement("button");
  const showBackupButton = document.createElement("button");
  const copyBackupButton = document.createElement("button");
  const backupToggleButton = document.createElement("button");
  const importInput = document.createElement("input");
  const backupPanel = document.createElement("div");
  const backupTextArea = document.createElement("textarea");
  const backupPanelConfig = getFormPanelConfig("backupText");

  buttonRow.className = "button-row";
  exportButton.type = "button";
  exportButton.id = "export-json-button";
  exportButton.className = "secondary-button";
  exportButton.textContent = "JSONエクスポート";
  exportButton.addEventListener("click", exportJson);

  showBackupButton.type = "button";
  showBackupButton.id = "show-backup-text-button";
  showBackupButton.className = "secondary-button";
  showBackupButton.textContent = "バックアップ文字列を表示";
  showBackupButton.addEventListener("click", showBackupText);

  copyBackupButton.type = "button";
  copyBackupButton.id = "copy-backup-text-button";
  copyBackupButton.className = "secondary-button";
  copyBackupButton.textContent = "バックアップ文字列をコピー";
  copyBackupButton.addEventListener("click", copyBackupText);

  backupToggleButton.type = "button";
  backupToggleButton.id = backupPanelConfig.buttonId;
  backupToggleButton.className = "form-toggle-button secondary-button";
  backupToggleButton.addEventListener("click", function () {
    toggleFormPanel("backupText");
  });

  importInput.type = "file";
  importInput.id = "import-json-input";
  importInput.accept = "application/json,.json";
  importInput.addEventListener("change", function (event) {
    const file = event.target && event.target.files ? event.target.files[0] : null;
    importJson(file);
    event.target.value = "";
  });

  backupTextArea.id = "backup-json-text";
  backupTextArea.rows = 12;
  backupTextArea.readOnly = true;
  backupTextArea.style.width = "100%";
  backupTextArea.style.marginTop = "12px";
  backupTextArea.setAttribute("aria-label", "バックアップ文字列");

  backupPanel.id = backupPanelConfig.panelId;
  backupPanel.className = "form-panel";
  backupPanel.appendChild(backupTextArea);

  buttonRow.appendChild(exportButton);
  buttonRow.appendChild(showBackupButton);
  buttonRow.appendChild(copyBackupButton);
  buttonRow.appendChild(backupToggleButton);
  buttonRow.appendChild(importInput);
  extraArea.appendChild(description);
  extraArea.appendChild(buttonRow);
  extraArea.appendChild(backupPanel);
  applyFormPanelState("backupText");
}

// iPhone Safari などでファイル保存が見つからない場合に、JSON文字列を画面へ表示します。
function showBackupText() {
  const backupTextArea = getElement("backup-json-text");

  if (!backupTextArea) {
    showMessage("バックアップ文字列の表示領域が見つかりません", "error");
    return;
  }

  try {
    backupTextArea.value = JSON.stringify(lifePlanData, null, 2);
    openFormPanel("backupText");
    backupTextArea.focus();
    showMessage("バックアップ文字列を表示しました", "success");
  } catch (error) {
    console.warn("バックアップ文字列の表示に失敗しました。", error);
    showMessage("バックアップ文字列の表示に失敗しました", "error");
  }
}

// バックアップ文字列をクリップボードへコピーします。
function copyBackupText() {
  const backupTextArea = getElement("backup-json-text");

  if (!backupTextArea) {
    showMessage("バックアップ文字列の表示領域が見つかりません", "error");
    return;
  }

  if (!backupTextArea.value) {
    showBackupText();
  }

  const backupText = backupTextArea.value;

  openFormPanel("backupText");
  backupTextArea.focus();
  backupTextArea.select();

  if (typeof backupTextArea.setSelectionRange === "function") {
    backupTextArea.setSelectionRange(0, backupText.length);
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    navigator.clipboard.writeText(backupText)
      .then(function () {
        showMessage("バックアップ文字列をコピーしました", "success");
      })
      .catch(function (error) {
        console.warn("バックアップ文字列のコピーに失敗しました。", error);
        showMessage("手動で全選択してコピーしてください", "error");
      });
    return;
  }

  try {
    if (typeof document.execCommand === "function" && document.execCommand("copy")) {
      showMessage("バックアップ文字列をコピーしました", "success");
      return;
    }
  } catch (error) {
    console.warn("バックアップ文字列のコピーに失敗しました。", error);
  }

  showMessage("手動で全選択してコピーしてください", "error");
}

// 現在のデータをJSONファイルとして書き出します。
function exportJson() {
  try {
    const jsonText = JSON.stringify(lifePlanData, null, 2);
    const blob = new Blob([jsonText], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `life-plan-backup-${getTodayDateString()}.json`;

    if (document.body) {
      document.body.appendChild(link);
    }

    link.click();

    if (typeof link.remove === "function") {
      link.remove();
    }

    URL.revokeObjectURL(url);
    showMessage("JSONをエクスポートしました", "success");
  } catch (error) {
    console.warn("JSONエクスポートに失敗しました。", error);
    showMessage("JSONエクスポートに失敗しました", "error");
  }
}

// JSONファイルからデータを読み込みます。
function importJson(file) {
  if (!file) {
    return;
  }

  try {
    const reader = new FileReader();

    reader.onload = function (event) {
      try {
        const jsonText = String((event.target && event.target.result) || "");
        const importedData = JSON.parse(jsonText);

        if (!isValidLifePlanData(importedData)) {
          showMessage("JSONインポートに失敗しました", "error");
          return;
        }

        const shouldImport = confirm("現在のデータを読み込んだJSONで上書きしますか？");

        if (!shouldImport) {
          showMessage("JSONインポートをキャンセルしました", "success");
          return;
        }

        lifePlanData = ensureDataShape(importedData);
        const saved = saveData();
        editingFamilyId = null;
        editingEventId = null;
        editingNisaRecordIds = {};
        renderAll();

        if (saved) {
          showMessage("JSONをインポートしました", "success");
        }
      } catch (error) {
        console.warn("JSONインポートに失敗しました。", error);
        showMessage("JSONインポートに失敗しました", "error");
      }
    };

    reader.onerror = function (error) {
      console.warn("JSONファイルの読み込みに失敗しました。", error);
      showMessage("JSONインポートに失敗しました", "error");
    };

    reader.readAsText(file);
  } catch (error) {
    console.warn("JSONインポートに失敗しました。", error);
    showMessage("JSONインポートに失敗しました", "error");
  }
}

// 描画関数を安全に実行します。
function runRenderStep(renderFunction, name) {
  try {
    renderFunction();
  } catch (error) {
    console.warn(`${name} の描画に失敗しました。`, error);
  }
}

// 画面全体を再描画します。
function renderAll() {
  lifePlanResults = calculateLifePlan(lifePlanData);
  runRenderStep(renderDashboard, "ダッシュボード");
  runRenderStep(renderCalculationSettingsSection, "計算設定");
  runRenderStep(renderFamilyList, "家族一覧");
  runRenderStep(renderFamilyForm, "家族追加・編集フォーム");
  runRenderStep(renderEventList, "イベント一覧");
  runRenderStep(renderEventForm, "イベント追加フォーム");
  runRenderStep(renderFinanceSummaries, "資産・収入・支出サマリー");
  runRenderStep(renderFinanceForm, "資産・収入・支出編集フォーム");
  runRenderStep(renderNisaSection, "NISA枠管理");
  runRenderStep(renderDollarInsuranceSection, "ドル建終身保険");
  runRenderStep(renderTableDisplaySettings, "ライフプラン表表示設定");
  runRenderStep(renderLifePlanTable, "ライフプラン表");
  runRenderStep(renderAssetChart, "年末資産グラフ");
  runRenderStep(renderDataManagement, "データ管理");
  runRenderStep(setupCollapsibleSections, "セクション開閉");
}

// 古い再描画入口を残し、renderAll に処理を集約します。
function renderApp() {
  renderAll();
}

// アプリを初期化します。
function initApp() {
  try {
    lifePlanData = loadData();
    lifePlanUiState = loadUiState();
    lifePlanResults = calculateLifePlan(lifePlanData);

    const saveButton = getElement("save-data-button");
    const resetButton = getElement("reset-data-button");

    if (saveButton) {
      saveButton.addEventListener("click", saveData);
    }

    if (resetButton) {
      resetButton.addEventListener("click", resetData);
    }

    renderAll();
  } catch (error) {
    console.warn("アプリの初期化に失敗しました。", error);
    lifePlanData = getInitialDataCopy();
    lifePlanResults = calculateLifePlan(lifePlanData);
    renderAll();
    showMessage("アプリの初期化に失敗しました", "error");
  }
}

// HTML の読み込みが終わってからアプリを起動します。
document.addEventListener("DOMContentLoaded", initApp);
