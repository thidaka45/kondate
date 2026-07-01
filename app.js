(function () {
  "use strict";

  var GEMINI_MODEL = "gemini-2.5-flash";
  var GEMINI_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL +
    ":generateContent";

  var APP_VERSION = "1.1.0";
  var APP_UPDATED = "2026-07-01";

  var MEAL_LABELS = ["朝ごはん", "お昼ごはん", "晩ごはん"];
  var SUN_POSITIONS = [
    { x: 40, y: 54 },
    { x: 170, y: 0 },
    { x: 300, y: 54 }
  ];

  var state = {
    meal: 0,
    tags: {},
    lastResults: []
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function init() {
    els.sunDot = $("sun-dot");
    els.tags = $("tags");
    els.ingredientsInput = $("ingredients-input");
    els.suggestBtn = $("suggest-btn");
    els.suggestBtnText = $("suggest-btn-text");
    els.results = $("results");
    els.resultsLabel = $("results-label");
    els.resultsList = $("results-list");
    els.errorPanel = $("error-panel");
    els.errorText = $("error-text");
    els.historyList = $("history-list");
    els.recipeModal = $("recipe-modal");
    els.modalTitle = $("modal-title");
    els.modalLinkRow = $("modal-link-row");
    els.modalIngredients = $("modal-ingredients");
    els.modalSteps = $("modal-steps");
    els.modalPickBtn = $("modal-pick-btn");
    els.settingsModal = $("settings-modal");
    els.apiKeyInput = $("api-key-input");
    els.versionText = $("version-text");

    $("today-date").textContent = formatToday();

    document.querySelectorAll(".mtab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        selectMeal(parseInt(tab.getAttribute("data-meal"), 10));
      });
    });

    document.querySelectorAll(".tag").forEach(function (tag) {
      tag.addEventListener("click", function () {
        var name = tag.getAttribute("data-tag");
        state.tags[name] = !state.tags[name];
        tag.classList.toggle("on", !!state.tags[name]);
      });
    });

    els.suggestBtn.addEventListener("click", handleSuggest);

    $("settings-btn").addEventListener("click", openSettings);
    $("settings-close").addEventListener("click", closeSettings);
    $("settings-save-btn").addEventListener("click", saveSettings);
    $("modal-close").addEventListener("click", closeRecipeModal);

    $("nav-shopping").addEventListener("click", function () {
      alert("買い物リスト機能は準備中です。次のアップデートで追加予定です。");
    });
    $("nav-kakeibo").addEventListener("click", function () {
      alert("家計簿アプリ「かんたん家計簿」との連携は準備中です。");
    });

    els.apiKeyInput.value = localStorage.getItem("kondate_gemini_key") || "";
    els.versionText.textContent =
      "きょうのごはん v" + APP_VERSION + "（更新日: " + APP_UPDATED + "）";

    renderHistory();

    if (!localStorage.getItem("kondate_gemini_key")) {
      openSettings();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  function formatToday() {
    var d = new Date();
    var weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return (
      d.getMonth() + 1 + "月" + d.getDate() + "日 (" + weekdays[d.getDay()] + ")"
    );
  }

  function selectMeal(idx) {
    state.meal = idx;
    document.querySelectorAll(".mtab").forEach(function (tab) {
      var isActive = parseInt(tab.getAttribute("data-meal"), 10) === idx;
      tab.classList.toggle("active", isActive);
    });
    var pos = SUN_POSITIONS[idx];
    els.sunDot.setAttribute("cx", pos.x);
    els.sunDot.setAttribute("cy", pos.y);
    hideResults();
  }

  function hideResults() {
    els.results.hidden = true;
    els.errorPanel.hidden = true;
  }

  function getApiKey() {
    return localStorage.getItem("kondate_gemini_key") || "";
  }

  function openSettings() {
    els.settingsModal.hidden = false;
  }
  function closeSettings() {
    if (!getApiKey()) return;
    els.settingsModal.hidden = true;
  }
  function saveSettings() {
    var key = els.apiKeyInput.value.trim();
    if (!key) {
      alert("APIキーを入力してください。");
      return;
    }
    localStorage.setItem("kondate_gemini_key", key);
    els.settingsModal.hidden = true;
  }

  function activeTags() {
    return Object.keys(state.tags).filter(function (k) {
      return state.tags[k];
    });
  }

  function buildPrompt() {
    var mealLabel = MEAL_LABELS[state.meal];
    var tags = activeTags();
    var ingredients = els.ingredientsInput.value.trim();

    var lines = [];
    lines.push(
      "あなたは家庭料理のアドバイザーです。次の条件に合う" +
        mealLabel +
        "の献立を3つ提案してください。"
    );
    if (tags.length > 0) {
      lines.push("条件タグ: " + tags.join(", "));
    }
    if (ingredients) {
      lines.push("手持ちの食材: " + ingredients + "（できるだけ活用してください）");
    }
    lines.push(
      "出力は次のJSON配列の形式のみで返してください。前置きや説明文は一切不要です。"
    );
    lines.push(
      '[{"name":"料理名","time_minutes":10,"ingredients":["材料1","材料2"],"steps":["手順1","手順2"]}]'
    );
    return lines.join("\n");
  }

  function handleSuggest() {
    var apiKey = getApiKey();
    if (!apiKey) {
      openSettings();
      return;
    }

    setLoading(true);
    hideResults();

    var prompt = buildPrompt();

    fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("APIエラー (status " + res.status + ")");
        }
        return res.json();
      })
      .then(function (data) {
        var text = extractText(data);
        var recipes = parseRecipes(text);
        if (!recipes.length) {
          throw new Error("献立の候補を読み取れませんでした。");
        }
        state.lastResults = recipes;
        renderResults(recipes);
      })
      .catch(function (err) {
        showError(err.message || "献立の取得に失敗しました。もう一度お試しください。");
      })
      .finally(function () {
        setLoading(false);
      });
  }

  function extractText(data) {
    try {
      return data.candidates[0].content.parts[0].text;
    } catch (e) {
      return "";
    }
  }

  function parseRecipes(text) {
    try {
      var cleaned = text.replace(/```json|```/g, "").trim();
      var parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) {
      return [];
    }
  }

  function setLinkChips(scopeEl, recipeName) {
    var query = encodeURIComponent((recipeName || "") + " 料理");
    var chips = scopeEl.querySelectorAll(".link-chip");
    if (chips.length < 2) return;
    chips[0].href =
      "https://www.google.com/search?tbm=isch&q=" + query;
    chips[1].href =
      "https://cookpad.com/search/" + encodeURIComponent(recipeName || "");
  }

  function setLoading(isLoading) {
    els.suggestBtn.disabled = isLoading;
    els.suggestBtnText.textContent = isLoading
      ? "考え中…"
      : "献立を提案してもらう";
  }

  function showError(message) {
    els.errorText.textContent = message;
    els.errorPanel.hidden = false;
  }

  function renderResults(recipes) {
    els.resultsLabel.textContent = MEAL_LABELS[state.meal] + "の提案";
    els.resultsList.innerHTML = "";

    recipes.forEach(function (recipe, idx) {
      var card = document.createElement("div");
      card.className = "recipe-card";

      var ingredientsText = Array.isArray(recipe.ingredients)
        ? recipe.ingredients.join(", ")
        : "";

      card.innerHTML =
        '<div class="recipe-card-head">' +
        '<p class="recipe-name"></p>' +
        '<span class="time-badge"></span>' +
        "</div>" +
        '<p class="recipe-ingredients"></p>' +
        '<div class="link-row">' +
        '<a class="link-chip" target="_blank" rel="noopener">🔍 画像で見る</a>' +
        '<a class="link-chip" target="_blank" rel="noopener">📖 クックパッドで見る</a>' +
        "</div>" +
        '<div class="card-actions">' +
        '<button class="secondary-btn">作り方を見る</button>' +
        '<button class="pick-btn">これにする</button>' +
        "</div>";

      card.querySelector(".recipe-name").textContent = recipe.name || "";
      card.querySelector(".time-badge").textContent = recipe.time_minutes
        ? "⏱ " + recipe.time_minutes + "分"
        : "";
      card.querySelector(".recipe-ingredients").textContent = ingredientsText;
      setLinkChips(card, recipe.name);

      card
        .querySelector(".secondary-btn")
        .addEventListener("click", function () {
          openRecipeModal(recipe);
        });
      card.querySelector(".pick-btn").addEventListener("click", function () {
        pickRecipe(recipe);
      });

      els.resultsList.appendChild(card);
    });

    els.results.hidden = false;
  }

  function openRecipeModal(recipe) {
    els.modalTitle.textContent = recipe.name || "";
    setLinkChips(els.modalLinkRow, recipe.name);

    els.modalIngredients.innerHTML = "";
    (recipe.ingredients || []).forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      els.modalIngredients.appendChild(li);
    });
    els.modalSteps.innerHTML = "";
    (recipe.steps || []).forEach(function (step) {
      var li = document.createElement("li");
      li.textContent = step;
      els.modalSteps.appendChild(li);
    });
    els.modalPickBtn.onclick = function () {
      pickRecipe(recipe);
      closeRecipeModal();
    };
    els.recipeModal.hidden = false;
  }

  function closeRecipeModal() {
    els.recipeModal.hidden = true;
  }

  function pickRecipe(recipe) {
    var history = loadHistory();
    history.unshift({
      meal: MEAL_LABELS[state.meal],
      name: recipe.name || "",
      date: formatToday()
    });
    history = history.slice(0, 10);
    localStorage.setItem("kondate_history", JSON.stringify(history));
    renderHistory();
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem("kondate_history");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function renderHistory() {
    var history = loadHistory();
    els.historyList.innerHTML = "";
    if (history.length === 0) {
      var p = document.createElement("p");
      p.className = "empty-hint";
      p.textContent =
        "まだ履歴がありません。献立を提案してもらうとここに残ります。";
      els.historyList.appendChild(p);
      return;
    }
    history.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML =
        '<span><span class="h-meal"></span><span class="h-name"></span></span><span class="h-date"></span>';
      row.querySelector(".h-meal").textContent = item.meal;
      row.querySelector(".h-name").textContent = item.name;
      row.querySelector(".h-date").textContent = item.date;
      els.historyList.appendChild(row);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
