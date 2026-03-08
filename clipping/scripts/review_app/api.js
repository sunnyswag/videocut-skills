export async function fetchProjects() {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function fetchProjectData(projectId) {
  const res = await fetch('/api/data/' + encodeURIComponent(projectId));
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function executeProjectCut(projectId, payload) {
  const res = await fetch('/api/cut/' + encodeURIComponent(projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

