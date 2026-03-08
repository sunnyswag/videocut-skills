async function requestJson(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

export async function fetchProjects() {
  return requestJson('/api/projects');
}

export async function fetchProjectData(projectId) {
  return requestJson('/api/data/' + encodeURIComponent(projectId));
}

export async function executeProjectCut(projectId, payload) {
  return requestJson('/api/cut/' + encodeURIComponent(projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

