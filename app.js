// アプリ全体で使う現在のデータと計算結果です。
let lifePlanData = null;
let lifePlanResults = [];
let messageTimerId = null;
let editingEventId = null;
let editingFamilyId = null;

// データを安全に複製します。
function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

// data.js の初期データをコピーして返します。
function getInitialDataCopy() {
  if (typeof initialLifePlanData === "undefined") {
    return {
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
  }

  return cloneData(initialLifePlanData);
}

// localStorage の保存キーを取得します。
function getStorageKey() {
  if (typeof LIFE_PLAN_STORAGE_KEY === "undefined") {
    return "lifePlanLocal.data.v1";
  }

  return LIFE_PLAN_STORAGE_KEY;
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

// localStorage から保存済みデータを読み込みます。
function loadData() {
  try {
    const savedData = localStorage.getItem(getStorageKey());

    if (!savedData) {
      return getInitialDataCopy();
    }

    return JSON.parse(savedData) || getInitialDataCopy();
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

  lifePlanData = getInitialDataCopy();
  editingEventId = null;
  editingFamilyId = null;
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
    toNumber(assets.cash) +
    toNumber(assets.investments) +
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
  const expenses = data.expenses || {};
  const monthlyTotal =
    toNumber(expenses.livingMonthly) +
    toNumber(expenses.mortgageMonthly) +
    toNumber(expenses.insuranceMonthly) +
    toNumber(expenses.educationMonthly) +
    toNumber(expenses.carMonthly) +
    toNumber(expenses.otherFixedMonthly);

  return monthlyTotal * 12;
}

// 年ごとのライフプラン結果を計算します。
function calculateLifePlan(data) {
  if (!data || !data.settings) {
    return [];
  }

  const startYear = Math.trunc(toNumber(data.settings.startYear));
  const endYear = Math.trunc(toNumber(data.settings.endYear));

  if (!startYear || !endYear || endYear < startYear) {
    return [];
  }

  const family = Array.isArray(data.family) ? data.family : [];
  const events = Array.isArray(data.events) ? data.events : [];
  const results = [];
  let startAssets = calculateTotalAssets(data);

  for (let year = startYear; year <= endYear; year += 1) {
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
      endAssets: endAssets
    });

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

  events.forEach(function (event) {
    const card = document.createElement("article");
    const buttonRow = document.createElement("div");
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

    buttonRow.className = "button-row";
    editButton.type = "button";
    editButton.className = "secondary-button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", function () {
      startEditEvent(event.id);
    });
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", function () {
      handleDeleteEvent(event.id);
    });
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

// 資産・収入・支出のサマリーを表示します。
function renderFinanceSummaries() {
  if (!lifePlanData) {
    return;
  }

  const assets = lifePlanData.assets || {};
  const income = lifePlanData.income || {};
  const expenses = lifePlanData.expenses || {};

  renderSummaryCard("asset-summary", "現在資産", [
    { label: "現金・預金", value: formatYen(assets.cash) },
    { label: "投資資産", value: formatYen(assets.investments) },
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
    { label: "生活費 月額", value: formatYen(expenses.livingMonthly) },
    { label: "住宅ローン 月額", value: formatYen(expenses.mortgageMonthly) },
    { label: "保険 月額", value: formatYen(expenses.insuranceMonthly) },
    { label: "教育費 月額", value: formatYen(expenses.educationMonthly) },
    { label: "車関連 月額", value: formatYen(expenses.carMonthly) },
    { label: "その他固定費 月額", value: formatYen(expenses.otherFixedMonthly) },
    { label: "通常年間支出", value: formatYen(calculateAnnualRegularExpenses(lifePlanData)) }
  ]);
}

// 数値入力欄を作ります。
function createNumberField(id, label, value) {
  const field = document.createElement("div");
  const labelElement = document.createElement("label");
  const input = document.createElement("input");

  field.className = "form-field";
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  input.type = "number";
  input.id = id;
  input.name = id;
  input.step = "1";
  input.inputMode = "numeric";
  input.value = toNumber(value);

  field.appendChild(labelElement);
  field.appendChild(input);
  return field;
}

// フォーム内の入力グループを作ります。
function appendFinanceFormGroup(form, title, fields) {
  const group = document.createElement("div");
  const grid = document.createElement("div");

  group.className = "list-card";
  grid.className = "form-grid";
  group.appendChild(createTextElement("h3", "list-title", title));

  fields.forEach(function (field) {
    grid.appendChild(createNumberField(field.id, field.label, field.value));
  });

  group.appendChild(grid);
  form.appendChild(group);
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
  formArea.appendChild(form);
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
  formArea.appendChild(form);
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
  const form = document.createElement("form");
  const buttonRow = document.createElement("div");
  const submitButton = document.createElement("button");

  form.id = "finance-form";
  form.addEventListener("submit", handleFinanceFormSubmit);
  form.appendChild(createTextElement("h3", "list-title", "資産・収入・支出を編集"));

  appendFinanceFormGroup(form, "現在資産", [
    { id: "finance-assets-cash", label: "現金・預金", value: assets.cash },
    { id: "finance-assets-investments", label: "投資資産", value: assets.investments },
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

  appendFinanceFormGroup(form, "毎月支出", [
    { id: "finance-expenses-living-monthly", label: "生活費", value: expenses.livingMonthly },
    { id: "finance-expenses-mortgage-monthly", label: "住宅ローン", value: expenses.mortgageMonthly },
    { id: "finance-expenses-insurance-monthly", label: "保険", value: expenses.insuranceMonthly },
    { id: "finance-expenses-education-monthly", label: "教育費", value: expenses.educationMonthly },
    { id: "finance-expenses-car-monthly", label: "車関連", value: expenses.carMonthly },
    { id: "finance-expenses-other-fixed-monthly", label: "その他固定費", value: expenses.otherFixedMonthly }
  ]);

  buttonRow.className = "button-row";
  submitButton.type = "submit";
  submitButton.className = "primary-button";
  submitButton.textContent = "資産・収入・支出を保存";
  buttonRow.appendChild(submitButton);
  form.appendChild(buttonRow);
  formArea.appendChild(form);
}

// フォーム送信時に入力値をデータへ反映します。
function handleFinanceFormSubmit(event) {
  event.preventDefault();

  if (!lifePlanData) {
    lifePlanData = getInitialDataCopy();
  }

  lifePlanData.assets = {
    cash: getInputNumber("finance-assets-cash"),
    investments: getInputNumber("finance-assets-investments"),
    insurance: getInputNumber("finance-assets-insurance"),
    otherAssets: getInputNumber("finance-assets-other-assets"),
    liabilities: getInputNumber("finance-assets-liabilities")
  };

  lifePlanData.income = {
    salary: getInputNumber("finance-income-salary"),
    bonus: getInputNumber("finance-income-bonus"),
    allowance: getInputNumber("finance-income-allowance"),
    otherIncome: getInputNumber("finance-income-other-income"),
    yearlyChanges: Array.isArray(lifePlanData.income && lifePlanData.income.yearlyChanges)
      ? lifePlanData.income.yearlyChanges
      : []
  };

  lifePlanData.expenses = {
    livingMonthly: getInputNumber("finance-expenses-living-monthly"),
    mortgageMonthly: getInputNumber("finance-expenses-mortgage-monthly"),
    insuranceMonthly: getInputNumber("finance-expenses-insurance-monthly"),
    educationMonthly: getInputNumber("finance-expenses-education-monthly"),
    carMonthly: getInputNumber("finance-expenses-car-monthly"),
    otherFixedMonthly: getInputNumber("finance-expenses-other-fixed-monthly")
  };

  const saved = saveData();
  renderAll();

  if (saved) {
    showMessage("資産・収入・支出を更新しました", "success");
  }
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
function appendTableHeaderCell(row, text) {
  const cell = document.createElement("th");
  cell.scope = "col";
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

// 家族ごとに年齢列を分けた表ヘッダーを作ります。
function renderLifePlanTableHeader(table, family) {
  const tableHead = document.createElement("thead");
  const row = document.createElement("tr");
  const headers = [
    "年"
  ].concat(
    family.map(function (member) {
      return member.name || "名前未設定";
    }),
    ["イベント", "イベント支出", "年間収入", "通常支出", "年間収支", "年初資産", "年末資産"]
  );

  headers.forEach(function (header) {
    appendTableHeaderCell(row, header);
  });

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
    family.forEach(function (member) {
      const ageInfo = result.familyAges.find(function (familyAge) {
        return familyAge.id === member.id;
      });
      const ageText = ageInfo && ageInfo.age !== null ? `${ageInfo.age}歳` : "-";
      appendTableCell(row, ageText);
    });
    appendTableCell(row, eventText);
    appendTableCell(row, formatYen(result.eventExpenseTotal), "number-cell");
    appendTableCell(row, formatYen(result.annualIncome), "number-cell");
    appendTableCell(row, formatYen(result.regularExpenses), "number-cell");
    appendTableCell(row, formatYen(result.annualBalance), "number-cell", result.annualBalance < 0);
    appendTableCell(row, formatYen(result.startAssets), "number-cell");
    appendTableCell(row, formatYen(result.endAssets), "number-cell", result.endAssets < 0);

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
  const importInput = document.createElement("input");

  buttonRow.className = "button-row";
  exportButton.type = "button";
  exportButton.id = "export-json-button";
  exportButton.className = "secondary-button";
  exportButton.textContent = "JSONエクスポート";
  exportButton.addEventListener("click", exportJson);

  importInput.type = "file";
  importInput.id = "import-json-input";
  importInput.accept = "application/json,.json";
  importInput.addEventListener("change", function (event) {
    const file = event.target && event.target.files ? event.target.files[0] : null;
    importJson(file);
    event.target.value = "";
  });

  buttonRow.appendChild(exportButton);
  buttonRow.appendChild(importInput);
  extraArea.appendChild(description);
  extraArea.appendChild(buttonRow);
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

        lifePlanData = importedData;
        const saved = saveData();
        editingFamilyId = null;
        editingEventId = null;
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
  runRenderStep(renderFamilyList, "家族一覧");
  runRenderStep(renderFamilyForm, "家族追加・編集フォーム");
  runRenderStep(renderEventList, "イベント一覧");
  runRenderStep(renderEventForm, "イベント追加フォーム");
  runRenderStep(renderFinanceSummaries, "資産・収入・支出サマリー");
  runRenderStep(renderFinanceForm, "資産・収入・支出編集フォーム");
  runRenderStep(renderLifePlanTable, "ライフプラン表");
  runRenderStep(renderAssetChart, "年末資産グラフ");
  runRenderStep(renderDataManagement, "データ管理");
}

// 古い再描画入口を残し、renderAll に処理を集約します。
function renderApp() {
  renderAll();
}

// アプリを初期化します。
function initApp() {
  try {
    lifePlanData = loadData();
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
