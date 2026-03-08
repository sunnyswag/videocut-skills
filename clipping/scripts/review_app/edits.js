export function buildEditsPayload(words, selected, burnSubtitle) {
  const parentMeta = new Map();
  words.forEach((w) => {
    if (typeof w.parentIndex !== 'number') return;
    if (!parentMeta.has(w.parentIndex)) {
      parentMeta.set(w.parentIndex, { childSet: new Set(), hasWholeLeaf: false });
    }
    const meta = parentMeta.get(w.parentIndex);
    if (typeof w.childIndex === 'number') meta.childSet.add(w.childIndex);
    else meta.hasWholeLeaf = true;
  });

  const selectedByParent = new Map();
  Array.from(selected).forEach((idx) => {
    const w = words[idx];
    if (!w || typeof w.parentIndex !== 'number') return;
    if (!selectedByParent.has(w.parentIndex)) {
      selectedByParent.set(w.parentIndex, { hasWholeLeaf: false, childSet: new Set() });
    }
    const item = selectedByParent.get(w.parentIndex);
    if (typeof w.childIndex === 'number') item.childSet.add(w.childIndex);
    else item.hasWholeLeaf = true;
  });

  const deletes = [];
  Array.from(selectedByParent.keys()).sort((a, b) => a - b).forEach((parent) => {
    const selectedMeta = selectedByParent.get(parent);
    const allMeta = parentMeta.get(parent) || { childSet: new Set(), hasWholeLeaf: false };
    const allChildren = Array.from(allMeta.childSet).sort((a, b) => a - b);
    const selectedChildren = Array.from(selectedMeta.childSet).sort((a, b) => a - b);

    const isWholeParent = selectedMeta.hasWholeLeaf
      || allMeta.hasWholeLeaf
      || (allChildren.length > 0 && selectedChildren.length === allChildren.length);

    if (isWholeParent) deletes.push({ pathSet: { parent } });
    else if (selectedChildren.length > 0) deletes.push({ pathSet: { parent, children: selectedChildren } });
  });

  return { deletes, burnSubtitle };
}

