import { toBooleanAttribute, setAriaHidden } from "./domBooleanState.js";

const DEFAULT_TEMPLATE_ICON_SOURCE_LIMIT = 6;

export function createTemplateOptionIcon(sources = [], { iconSourceLimit = DEFAULT_TEMPLATE_ICON_SOURCE_LIMIT } = {}) {
    const limit = Math.max(1, Number(iconSourceLimit) || DEFAULT_TEMPLATE_ICON_SOURCE_LIMIT);
    const iconSources = Array.isArray(sources) ? sources.filter(Boolean).slice(0, limit) : [];
    if (!iconSources.length) return null;

    const icon = document.createElement("img");
    icon.className = "files-games-option-icon";
    icon.alt = "";
    setAriaHidden(icon, true);
    icon.loading = "lazy";
    icon.decoding = "async";
    icon.referrerPolicy = "no-referrer";
    let index = 0;
    const applySource = (nextIndex) => {
        if (nextIndex >= iconSources.length) {
            icon.classList.add("is-hidden");
            icon.removeAttribute("src");
            return;
        }
        index = nextIndex;
        icon.src = iconSources[index];
    };
    icon.addEventListener("error", () => {
        applySource(index + 1);
    });
    applySource(0);
    return icon;
}

export function renderTemplateOptionLabel(option, name = "", iconSources = [], { iconSourceLimit = DEFAULT_TEMPLATE_ICON_SOURCE_LIMIT } = {}) {
    const icon = createTemplateOptionIcon(iconSources, { iconSourceLimit });
    if (icon) option.appendChild(icon);
    const label = document.createElement("span");
    label.className = "files-games-option-label";
    label.textContent = String(name || "");
    option.appendChild(label);
}

export function syncTemplateSelectorShell({
    section,
    toggle,
    list,
    loadButton,
    sectionId,
    sectionOpen,
    listOpen,
    hasItems,
    hasSelection,
} = {}) {
    if (!section || !toggle || !list) return false;
    toggle.setAttribute("draggable", "true");
    toggle.dataset.filesSectionId = String(sectionId || "");
    if (!sectionOpen || !hasItems) {
        setAriaHidden(section, true);
        section.setAttribute("data-list-open", "false");
        toggle.disabled = true;
        toggle.setAttribute("aria-expanded", "false");
        setAriaHidden(list, true);
        list.innerHTML = "";
        list.removeAttribute("aria-activedescendant");
        if (loadButton) {
            loadButton.disabled = true;
            loadButton.hidden = true;
        }
        return false;
    }

    setAriaHidden(section, false);
    section.setAttribute("data-list-open", toBooleanAttribute(Boolean(listOpen)));
    toggle.disabled = false;
    toggle.setAttribute("aria-expanded", toBooleanAttribute(Boolean(listOpen)));
    setAriaHidden(list, !listOpen);
    if (loadButton) {
        loadButton.hidden = !listOpen;
        loadButton.disabled = !hasSelection || !listOpen;
    }
    return true;
}

export function renderTemplateSelectorOptions(listNode, items = [], selectedId = "", {
    optionIdPrefix = "template-option",
    optionDatasetKey = "templateId",
    itemClassName = "files-games-item",
    iconSourceLimit = DEFAULT_TEMPLATE_ICON_SOURCE_LIMIT,
} = {}) {
    if (!listNode) return;
    let activeDescendant = "";
    listNode.innerHTML = "";
    items.forEach((entry, index) => {
        const option = document.createElement("button");
        const optionId = `${optionIdPrefix}-${index}`;
        const selected = entry.id === selectedId;
        option.type = "button";
        option.className = "files-games-option";
        option.id = optionId;
        option.dataset[optionDatasetKey] = entry.id;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", toBooleanAttribute(selected));
        option.setAttribute("data-selected", toBooleanAttribute(selected));
        renderTemplateOptionLabel(option, entry.name, entry.iconSources, { iconSourceLimit });

        const item = document.createElement("li");
        item.className = itemClassName;
        item.appendChild(option);
        listNode.appendChild(item);

        if (selected) activeDescendant = optionId;
    });
    if (activeDescendant) {
        listNode.setAttribute("aria-activedescendant", activeDescendant);
    } else {
        listNode.removeAttribute("aria-activedescendant");
    }
}
