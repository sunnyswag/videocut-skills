import { useEffect, useMemo, useState } from '../preact.js';
import { fetchProjectData, fetchProjects } from '../api.js';

export function useProjectDataState() {
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [stateByProject, setStateByProject] = useState({});
  const [errorText, setErrorText] = useState('');

  const currentState = currentProjectId ? stateByProject[currentProjectId] : null;
  const words = currentState?.words || [];
  const selected = currentState?.selected || new Set();
  const autoSelected = currentState?.autoSelected || new Set();
  const burnSubtitle = Boolean(currentState?.burnSubtitle);

  const selectedDuration = useMemo(() => {
    let total = 0;
    selected.forEach((i) => { total += (words[i]?.end || 0) - (words[i]?.start || 0); });
    return total;
  }, [selected, words]);

  const setProjectState = (projectId, updater) => {
    setStateByProject((prev) => {
      const prevState = prev[projectId];
      if (!prevState) return prev;
      const nextState = updater(prevState);
      return { ...prev, [projectId]: nextState };
    });
  };

  const loadOneProject = async (projectId) => {
    const data = await fetchProjectData(projectId);
    const projectWords = data.words || [];
    const projectAutoSelected = new Set(Array.isArray(data.autoSelected) ? data.autoSelected : []);
    const projectSelected = new Set(projectAutoSelected);
    setStateByProject((prev) => ({
      ...prev,
      [projectId]: {
        words: projectWords,
        autoSelected: projectAutoSelected,
        selected: projectSelected,
        burnSubtitle: false,
      },
    }));
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchProjects();
        setProjects(list);
        if (!list.length) return;
        setCurrentProjectId(list[0].id);
        const results = await Promise.allSettled(list.map((p) => loadOneProject(p.id)));
        const failedCount = results.filter((r) => r.status === 'rejected').length;
        if (failedCount > 0) {
          setErrorText(`部分项目加载失败（${failedCount}/${list.length}）`);
        }
      } catch (err) {
        setErrorText(err.message || String(err));
      }
    })();
  }, []);

  const setBurnSubtitle = (value) => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => ({ ...state, burnSubtitle: Boolean(value) }));
  };

  return {
    projects,
    currentProjectId,
    setCurrentProjectId,
    stateByProject,
    setProjectState,
    currentState,
    words,
    selected,
    autoSelected,
    burnSubtitle,
    setBurnSubtitle,
    selectedDuration,
    errorText,
  };
}
