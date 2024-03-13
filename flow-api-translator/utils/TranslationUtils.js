/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 * @format
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createTranslationContext = createTranslationContext;

function createTranslationContext(code, scopeManager, {
  recoverFromErrors
}) {
  const referenceMap = new Map();
  const variableMap = new Map();
  const moduleScope = scopeManager.globalScope.childScopes[0];

  if (moduleScope == null || moduleScope.type !== 'module') {
    throw new Error('createTranslationContext: Module scope not found');
  }

  for (const variable of moduleScope.variables) {
    for (const reference of variable.references) {
      referenceMap.set(reference.identifier, variable);
      variableMap.set(variable.name, variable);
    }
  }

  return {
    scopeManager,
    referenceMap,
    variableMap,
    recoverFromErrors,
    code
  };
}