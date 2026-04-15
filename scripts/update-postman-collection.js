const fs = require('fs');
const path = require('path');

const collectionPath = path.join(__dirname, '..', 'Coach_Plingo_Auth_API.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

function authHeader() {
  return [{ key: 'Authorization', value: 'Bearer {{access_token}}' }];
}

function jsonHeaders(includeAuth = false) {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  if (includeAuth) headers.push({ key: 'Authorization', value: 'Bearer {{access_token}}' });
  return headers;
}

function upsertRequest(folder, requestName, requestObj) {
  const idx = folder.item.findIndex((i) => i.name === requestName);
  if (idx >= 0) {
    folder.item[idx] = requestObj;
  } else {
    folder.item.push(requestObj);
  }
}

function ensureTopFolder(name) {
  let folder = collection.item.find((i) => i.name === name);
  if (!folder) {
    folder = { name, item: [] };
    collection.item.push(folder);
  }
  return folder;
}

function ensureSubFolder(parent, name) {
  let folder = parent.item.find((i) => i.name === name && Array.isArray(i.item));
  if (!folder) {
    folder = { name, item: [] };
    parent.item.push(folder);
  }
  return folder;
}

const learning = ensureTopFolder('Learning');
const learningPaths = ensureSubFolder(learning, 'Learning Paths');

upsertRequest(learningPaths, 'Archive Learning Path', {
  name: 'Archive Learning Path',
  request: {
    method: 'PATCH',
    header: authHeader(),
    url: '{{base_url}}/learning/paths/{{learning_path_id}}/archive',
    description: 'Archive an active learning path.'
  },
  response: []
});

upsertRequest(learningPaths, 'Get Path Subcategories', {
  name: 'Get Path Subcategories',
  request: {
    method: 'GET',
    header: authHeader(),
    url: '{{base_url}}/learning/paths/{{learning_path_id}}/subcategories',
    description: 'Get subcategory progress for a learning path.'
  },
  response: []
});

upsertRequest(learningPaths, 'Get Path Readiness', {
  name: 'Get Path Readiness',
  request: {
    method: 'GET',
    header: authHeader(),
    url: '{{base_url}}/learning/paths/{{learning_path_id}}/readiness',
    description: 'Check if first lesson content is ready after path creation.'
  },
  response: []
});

const contentGeneration = ensureTopFolder('Content Generation');
const generateLesson = contentGeneration.item.find((i) => i.name === 'Generate Lesson');

if (generateLesson && generateLesson.request && generateLesson.request.body && generateLesson.request.body.mode === 'raw') {
  const payload = {
    jobId: '{{job_id}}',
    payload: {
      learningPathId: '{{learning_path_id}}',
      learnerId: '{{learner_id}}',
      language: '{{language}}',
      profession: 'healthcare',
      currentSubcategoryId: 'sub-healthcare-basics',
      currentSubcategoryName: 'Healthcare Basics',
      currentSubcategoryDescription: 'Essential introductory healthcare vocabulary',
      subcategories: [
        {
          id: 'sub-healthcare-basics',
          name: 'Healthcare Basics',
          description: 'Essential introductory healthcare vocabulary',
          wordAllocation: 40,
          position: 1
        },
        {
          id: 'sub-patient-intake',
          name: 'Patient Intake',
          description: 'Vocabulary for patient intake and triage',
          wordAllocation: 60,
          position: 2
        }
      ],
      wordsPerLesson: 20,
      globalSetId: '{{global_set_id}}',
      milestoneId: '{{milestone_id}}',
      baseLanguage: 'en',
      excludeWords: []
    }
  };

  generateLesson.request.body.raw = JSON.stringify(payload, null, 2);

  if (Array.isArray(generateLesson.response)) {
    for (const res of generateLesson.response) {
      if (res.originalRequest && res.originalRequest.body && res.originalRequest.body.mode === 'raw') {
        res.originalRequest.body.raw = JSON.stringify(payload, null, 2);
      }
    }
  }
}

const catalog = ensureTopFolder('Catalog');
upsertRequest(catalog, 'List Languages', {
  name: 'List Languages',
  request: {
    method: 'GET',
    header: [],
    url: '{{base_url}}/catalog/languages',
    description: 'List available languages.'
  },
  response: []
});

upsertRequest(catalog, 'List Professions', {
  name: 'List Professions',
  request: {
    method: 'GET',
    header: [],
    url: '{{base_url}}/catalog/professions',
    description: 'List available professions.'
  },
  response: []
});

upsertRequest(catalog, 'List Profession Subcategories', {
  name: 'List Profession Subcategories',
  request: {
    method: 'GET',
    header: [],
    url: '{{base_url}}/catalog/professions/{{profession_id}}/subcategories?language={{language}}',
    description: 'List profession subcategories for a selected language.'
  },
  response: []
});

const learner = ensureTopFolder('Learner');
upsertRequest(learner, 'Get Streak', {
  name: 'Get Streak',
  request: {
    method: 'GET',
    header: authHeader(),
    url: '{{base_url}}/learner/streak',
    description: 'Get learner streak information.'
  },
  response: []
});

fs.writeFileSync(collectionPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log('Postman collection updated successfully.');
