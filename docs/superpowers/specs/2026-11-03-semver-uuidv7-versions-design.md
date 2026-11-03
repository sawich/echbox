# Semver + UUIDv7 content versions (Approach A)

**Date:** 2026-11-03  
**Status:** approved (implemented)

## Intent

Version identity is UUIDv7. Users supply a semver on every create/new-version upload. Skipped versions can be added later. Latest is the highest semver.

## Approaches

1. **semver + UUIDv7 version id (chosen)**  
2. semver as label with integer — rejected  
3. semver as sole key without uuid — rejected  

## Model

- Version PK = uuidv7; `semver` unique per parent  
- Parent: `latest_semver` + `latest_version_id`  
- Softmods: no separate `package_version`  
- Storage: `{parentId}/{versionId}/`  
- API assets by `versionId`  
- Local install jsonl: `versionId` + `semver`  
