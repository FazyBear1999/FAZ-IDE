export function toBooleanAttribute(value) {
    return value ? "true" : "false";
}

export function setBooleanAttribute(node, attrName, value) {
    if (!node || !attrName) return;
    node.setAttribute(attrName, toBooleanAttribute(Boolean(value)));
}

export function setDataOpen(node, open) {
    setBooleanAttribute(node, "data-open", open);
}

export function setAriaHidden(node, hidden) {
    setBooleanAttribute(node, "aria-hidden", hidden);
}

export function setAriaSelected(node, selected) {
    setBooleanAttribute(node, "aria-selected", selected);
}

export function setAriaExpanded(node, expanded) {
    setBooleanAttribute(node, "aria-expanded", expanded);
}

export function setAriaPressed(node, pressed) {
    setBooleanAttribute(node, "aria-pressed", pressed);
}

export function setDataActive(node, active) {
    setBooleanAttribute(node, "data-active", active);
}

export function setDataPanelOpen(node, open) {
    setBooleanAttribute(node, "data-panel-open", open);
}

export function setVisibilityState(node, visible, { dataOpen = false } = {}) {
    if (!node) return;
    const isVisible = Boolean(visible);
    node.hidden = !isVisible;
    if (dataOpen) {
        node.dataset.open = toBooleanAttribute(isVisible);
    }
    setAriaHidden(node, !isVisible);
}

export function setTabActiveState(node, active) {
    if (!node) return;
    const isActive = Boolean(active);
    setAriaSelected(node, isActive);
    node.tabIndex = isActive ? 0 : -1;
    setDataActive(node, isActive);
}

export function setOpenStateAttributes(node, open) {
    const isOpen = Boolean(open);
    setDataOpen(node, isOpen);
    setAriaHidden(node, !isOpen);
}
