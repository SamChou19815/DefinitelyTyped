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
exports.default = flowToFlowDef;

var _hermesTransform = require("hermes-transform");

var _FlowAnalyze = require("./utils/FlowAnalyze");

var _TranslationUtils = require("./utils/TranslationUtils");

var _ErrorUtils = require("./utils/ErrorUtils");

var _hermesEstree = require("hermes-estree");

const EMPTY_TRANSLATION_RESULT = [null, []];

function convertArray(items, convert) {
  const resultItems = [];
  const deps = [];

  for (const item of items) {
    const [resultItem, itemDeps] = convert(item);

    if (resultItem != null) {
      resultItems.push(resultItem);
      deps.push(...itemDeps);
    }
  }

  return [resultItems, deps];
}

function getTopLevelStatement(node, context) {
  let currentNode = node;

  while (currentNode != null) {
    var _currentNode$parent;

    if (((_currentNode$parent = currentNode.parent) == null ? void 0 : _currentNode$parent.type) === 'Program') {
      // $FlowFixMe[incompatible-return]
      return currentNode;
    }

    currentNode = currentNode.parent;
  }

  throw (0, _ErrorUtils.translationError)(node, `getTopLevelStatement: Detached node of type "${node.type}" passed`, context);
}

function transferProgramStatementProperties(stmt, orgStmt) {
  // $FlowExpectedError[prop-missing]
  // $FlowExpectedError[incompatible-use]
  stmt.comments = orgStmt.comments; // $FlowExpectedError[incompatible-use]

  stmt.range = orgStmt.range; // $FlowExpectedError[incompatible-use]

  stmt.loc = orgStmt.loc;
}
/**
 * Consume an abribray Flow AST and convert it into a Type defintion file.
 *
 * To do this all runtime logic will be stripped and only Type that describe the module boundary will remain.
 */


function flowToFlowDef(ast, code, scopeManager, opts) {
  var _ast$interpreter$valu, _ast$interpreter;

  const context = (0, _TranslationUtils.createTranslationContext)(code, scopeManager, opts);
  const translatedStatements = new Map();

  function storeTranslatedStatement(stmt, orgStmt) {
    translatedStatements.set(orgStmt, stmt);
  }

  const seenDeps = new Set();
  const processedStatements = new Set();
  const pendingStatements = new Set();

  function updatePendingStatements(deps) {
    for (const dep of deps) {
      if (seenDeps.has(dep)) {
        continue;
      }

      seenDeps.add(dep);
      const variable = context.variableMap.get(dep);

      if (variable == null) {
        throw new Error(`updatePendingStatements: Variable for dependency "${dep}" not found`);
      }

      for (const def of variable.defs) {
        const stmt = def.node;

        if (stmt == null) {
          throw new Error(`updatePendingStatements: Variable parent of "${dep}" not found`);
        }

        const topLevelStmt = getTopLevelStatement(stmt, context);

        if (processedStatements.has(topLevelStmt)) {
          continue;
        }

        pendingStatements.add(topLevelStmt);
      }
    }
  }

  function updateProcessedStatement(stmt) {
    processedStatements.add(stmt);
    pendingStatements.delete(stmt);
  } // Process all export statements


  for (const stmt of ast.body) {
    const resultExport = convertExport(stmt, context);

    if (resultExport != null) {
      updateProcessedStatement(stmt);
      const [resultExportedStmt, deps] = resultExport;
      storeTranslatedStatement(resultExportedStmt, stmt);
      updatePendingStatements(deps);
    }
  }

  while (pendingStatements.size > 0) {
    const stmt = pendingStatements.values().next().value;

    if (stmt == null) {
      throw new Error(`flowToFlowDef: Invalid state, "pendingStatements" cannot be empty`);
    }

    updateProcessedStatement(stmt);
    const [resultStmt, deps] = convertStatement(stmt, context);
    storeTranslatedStatement(resultStmt, stmt);
    updatePendingStatements(deps);
  }

  const translatedBody = [];

  for (const stmt of ast.body) {
    const translatedStatement = translatedStatements.get(stmt);

    if (translatedStatement != null) {
      const optimizedStatement = stripUnusedDefs(translatedStatement, seenDeps, context);
      transferProgramStatementProperties(optimizedStatement, stmt);
      translatedBody.push(optimizedStatement);
    }
  }

  return [_hermesTransform.t.Program({
    body: translatedBody,
    sourceType: ast.sourceType,
    interpreter: (_ast$interpreter$valu = (_ast$interpreter = ast.interpreter) == null ? void 0 : _ast$interpreter.value) != null ? _ast$interpreter$valu : null,
    comments: ast.comments,
    tokens: ast.tokens,
    docblock: ast.docblock
  }), code];
}

function convertExport(stmt, context) {
  switch (stmt.type) {
    case 'ExportNamedDeclaration':
      {
        return convertExportNamedDeclaration(stmt, context);
      }

    case 'ExportDefaultDeclaration':
      {
        return convertExportDefaultDeclaration(stmt, context);
      }

    case 'ExportAllDeclaration':
    case 'DeclareExportAllDeclaration':
      {
        return [(0, _hermesTransform.asDetachedNode)(stmt), []];
      }

    case 'DeclareExportDeclaration':
    case 'DeclareModuleExports':
      {
        return [(0, _hermesTransform.asDetachedNode)(stmt), (0, _FlowAnalyze.analyzeTypeDependencies)(stmt, context)];
      }

    case 'ExpressionStatement':
      {
        const expr = stmt.expression;

        if (expr.type === 'AssignmentExpression' && expr.left.type === 'MemberExpression') {
          const member = expr.left;

          if ( // exports.A = 1;
          member.object.type === 'Identifier' && member.object.name === 'exports' || // module.exports.A = 1;
          member.object.type === 'MemberExpression' && member.object.object.type === 'Identifier' && member.object.object.name === 'module' && member.object.property.type === 'Identifier' && member.object.property.name === 'exports') {
            throw (0, _ErrorUtils.translationError)(stmt, `convertExport: Named CommonJS exports not supported. Use either \`module.exports = {...}\` or ES6 exports.`, context);
          }

          if ( // exports.A = 1;
          member.object.type === 'Identifier' && member.object.name === 'module' && member.property.type === 'Identifier' && member.property.name === 'exports') {
            const [typeAnnotation, deps] = convertExpressionToTypeAnnotation(expr.right, context);
            return [_hermesTransform.t.DeclareModuleExports({
              typeAnnotation: _hermesTransform.t.TypeAnnotation({
                typeAnnotation
              })
            }), deps];
          }
        }

        return null;
      }

    default:
      {
        // Skip non exported functions
        return null;
      }
  }
}

function stripUnusedDefs(detachedStmt, usedDeps, context) {
  // $FlowExpectedError[incompatible-type]
  const stmt = detachedStmt;

  switch (stmt.type) {
    case 'ImportDeclaration':
      {
        const resultSpecfiers = stmt.specifiers.filter(spec => usedDeps.has(spec.local.name));

        if (resultSpecfiers.length === 0) {
          throw (0, _ErrorUtils.translationError)(stmt, `stripUnusedDefs ImportDeclaration: No specifiers remaining`, context);
        }

        if (resultSpecfiers.length !== stmt.specifiers.length) {
          return _hermesTransform.t.ImportDeclaration({
            specifiers: resultSpecfiers,
            importKind: stmt.importKind,
            source: stmt.source,
            assertions: stmt.assertions
          });
        }

        return detachedStmt;
      }

    default:
      {
        return detachedStmt;
      }
  }
}

function convertStatement(stmt, context) {
  switch (stmt.type) {
    case 'ComponentDeclaration':
      {
        const [result, deps] = convertComponentDeclaration(stmt, context);
        return [result, deps];
      }

    case 'HookDeclaration':
      {
        const [result, deps] = convertHookDeclaration(stmt, context);
        return [result, deps];
      }

    case 'FunctionDeclaration':
      {
        const [result, deps] = convertFunctionDeclaration(stmt, context);
        return [result, deps];
      }

    case 'ClassDeclaration':
      {
        const [result, deps] = convertClassDeclaration(stmt, context);
        return [result, deps];
      }

    case 'InterfaceDeclaration':
      {
        const [result, deps] = convertInterfaceDeclaration(stmt, context);
        return [result, deps];
      }

    case 'TypeAlias':
      {
        const [result, deps] = convertTypeAlias(stmt, context);
        return [result, deps];
      }

    case 'OpaqueType':
      {
        const [result, deps] = convertOpaqueType(stmt, context);
        return [result, deps];
      }

    case 'ImportDeclaration':
      {
        const [result, deps] = convertImportDeclaration(stmt, context);
        return [result, deps];
      }

    case 'VariableDeclaration':
      {
        const [result, deps] = convertVariableDeclaration(stmt, context);
        return [result, deps];
      }

    case 'DeclareClass':
    case 'DeclareVariable':
    case 'DeclareFunction':
    case 'DeclareModule':
    case 'DeclareNamespace':
    case 'DeclareInterface':
    case 'DeclareTypeAlias':
    case 'DeclareOpaqueType':
    case 'EnumDeclaration':
      {
        return [(0, _hermesTransform.asDetachedNode)(stmt), (0, _FlowAnalyze.analyzeTypeDependencies)(stmt, context)];
      }

    default:
      {
        throw (0, _ErrorUtils.translationError)(stmt, `Statement: Unsupported statement type of "${stmt.type}"`, context);
      }
  }
}

function convertExpressionToTypeAnnotation(expr, context) {
  switch (expr.type) {
    case 'AsExpression':
      {
        const [resultExpr, deps] = convertAsExpression(expr, context);
        return [resultExpr, deps];
      }

    case 'TypeCastExpression':
      {
        const [resultExpr, deps] = convertTypeCastExpression(expr, context);
        return [resultExpr, deps];
      }

    case 'Identifier':
      {
        return [_hermesTransform.t.GenericTypeAnnotation({
          id: _hermesTransform.t.Identifier({
            name: expr.name
          })
        }), (0, _FlowAnalyze.analyzeTypeDependencies)(expr, context)];
      }

    case 'Literal':
      {
        const [resultExpr, deps] = convertLiteral(expr, context);
        return [resultExpr, deps];
      }

    case 'ObjectExpression':
      {
        const [resultExpr, deps] = convertObjectExpression(expr, context);
        return [resultExpr, deps];
      }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      {
        const [resultExpr, deps] = convertAFunction(expr, context);
        return [resultExpr, deps];
      }

    default:
      {
        return [(0, _ErrorUtils.flowFixMeOrError)(expr, `convertExpressionToTypeAnnotation: Unsupported expression of type "${expr.type}", a type annotation is required.`, context), []];
      }
  }
}

function convertObjectExpression(expr, context) {
  const [resultProperties, deps] = convertArray(expr.properties, prop => {
    switch (prop.type) {
      case 'SpreadElement':
        {
          const [resultExpr, deps] = convertExpressionToTypeAnnotation(prop.argument, context);
          return [_hermesTransform.t.ObjectTypeSpreadProperty({
            argument: resultExpr
          }), deps];
        }

      case 'Property':
        {
          if (!(0, _hermesEstree.isIdentifier)(prop.key) && !(0, _hermesEstree.isStringLiteral)(prop.key) && !(0, _hermesEstree.isNumericLiteral)(prop.key)) {
            throw (0, _ErrorUtils.translationError)(prop.key, `ObjectExpression Property: Unsupported key type of "${prop.key.type}"`, context);
          }

          if (prop.method === true) {
            if (prop.value.type !== 'ArrowFunctionExpression' && prop.value.type !== 'FunctionExpression') {
              throw (0, _ErrorUtils.translationError)(prop.key, `ObjectExpression Property: Expected method to have a function value, but got ${prop.value.type}`, context);
            }

            const [resultExpr, deps] = convertAFunction(prop.value, context);
            return [_hermesTransform.t.ObjectTypeMethodSignature({
              // $FlowFixMe[incompatible-call]
              key: (0, _hermesTransform.asDetachedNode)(prop.key),
              value: resultExpr
            }), deps];
          }

          if (prop.kind === 'get' || prop.kind === 'set') {
            if (prop.value.type !== 'ArrowFunctionExpression' && prop.value.type !== 'FunctionExpression') {
              throw (0, _ErrorUtils.translationError)(prop.key, `ObjectExpression Property: Expected accessor to have a function value, but got ${prop.value.type}`, context);
            }

            const kind = prop.kind;
            const [resultExpr, deps] = convertAFunction(prop.value, context);
            return [_hermesTransform.t.ObjectTypeAccessorSignature({
              // $FlowFixMe[incompatible-call]
              key: (0, _hermesTransform.asDetachedNode)(prop.key),
              kind,
              value: resultExpr
            }), deps];
          }

          const [resultExpr, deps] = convertExpressionToTypeAnnotation(prop.value, context);
          return [_hermesTransform.t.ObjectTypePropertySignature({
            // $FlowFixMe[incompatible-call]
            key: (0, _hermesTransform.asDetachedNode)(prop.key),
            value: resultExpr,
            optional: false,
            variance: null
          }), deps];
        }
    }
  });
  return [_hermesTransform.t.ObjectTypeAnnotation({
    inexact: false,
    exact: false,
    properties: resultProperties,
    indexers: [],
    callProperties: [],
    internalSlots: []
  }), deps];
}

function convertLiteral(expr, context) {
  switch (expr.literalType) {
    case 'bigint':
      {
        return [_hermesTransform.t.BigIntLiteralTypeAnnotation({
          raw: expr.raw
        }), []];
      }

    case 'boolean':
      {
        return [_hermesTransform.t.BooleanLiteralTypeAnnotation({
          raw: expr.raw,
          value: expr.value
        }), []];
      }

    case 'null':
      {
        return [_hermesTransform.t.NullLiteralTypeAnnotation({}), []];
      }

    case 'numeric':
      {
        return [_hermesTransform.t.NumberLiteralTypeAnnotation({
          raw: expr.raw,
          value: expr.value
        }), []];
      }

    case 'string':
      {
        return [_hermesTransform.t.StringLiteralTypeAnnotation({
          raw: expr.raw,
          value: expr.value
        }), []];
      }

    case 'regexp':
      {
        return [_hermesTransform.t.GenericTypeAnnotation({
          id: _hermesTransform.t.Identifier({
            name: 'RegExp'
          })
        }), []];
      }

    default:
      {
        throw (0, _ErrorUtils.translationError)(expr, 'convertLiteral: Unsupported literal type.', context);
      }
  }
}

function convertExportDeclaration(decl, opts, context) {
  switch (decl.type) {
    case 'ComponentDeclaration':
      {
        const [declDecl, deps] = convertComponentDeclaration(decl, context);
        return [opts.default ? _hermesTransform.t.DeclareExportDefaultDeclaration({
          declaration: declDecl
        }) : _hermesTransform.t.DeclareExportDeclarationNamedWithDeclaration({
          declaration: declDecl
        }), deps];
      }

    case 'HookDeclaration':
      {
        const [declDecl, deps] = convertHookDeclaration(decl, context);
        return [opts.default ? _hermesTransform.t.DeclareExportDefaultDeclaration({
          declaration: declDecl
        }) : _hermesTransform.t.DeclareExportDeclarationNamedWithDeclaration({
          declaration: declDecl
        }), deps];
      }

    case 'FunctionDeclaration':
      {
        const [declDecl, deps] = convertFunctionDeclaration(decl, context);
        return [opts.default ? _hermesTransform.t.DeclareExportDefaultDeclaration({
          declaration: declDecl
        }) : _hermesTransform.t.DeclareExportDeclarationNamedWithDeclaration({
          declaration: declDecl
        }), deps];
      }

    case 'ClassDeclaration':
      {
        const [declDecl, deps] = convertClassDeclaration(decl, context);
        return [opts.default ? _hermesTransform.t.DeclareExportDefaultDeclaration({
          declaration: declDecl
        }) : _hermesTransform.t.DeclareExportDeclarationNamedWithDeclaration({
          declaration: declDecl
        }), deps];
      }

    case 'InterfaceDeclaration':
      {
        if (opts.default) {
          throw (0, _ErrorUtils.translationError)(decl, 'ExportDeclaration: Default interface found, invalid AST.', context);
        }

        const [declDecl, deps] = convertInterfaceDeclaration(decl, context);
        return [_hermesTransform.t.ExportNamedDeclarationWithDeclaration({
          exportKind: 'type',
          declaration: declDecl
        }), deps];
      }

    case 'TypeAlias':
      {
        if (opts.default) {
          throw (0, _ErrorUtils.translationError)(decl, 'ExportDeclaration: Default type alias found, invalid AST.', context);
        }

        const [declDecl, deps] = convertTypeAlias(decl, context);
        return [_hermesTransform.t.ExportNamedDeclarationWithDeclaration({
          exportKind: 'type',
          declaration: declDecl
        }), deps];
      }

    case 'OpaqueType':
      {
        if (opts.default) {
          throw (0, _ErrorUtils.translationError)(decl, 'ExportDeclaration: Default opaque type found, invalid AST.', context);
        }

        const [declDecl, deps] = convertOpaqueType(decl, context);
        return [_hermesTransform.t.DeclareExportDeclarationNamedWithDeclaration({
          declaration: declDecl
        }), deps];
      }

    case 'VariableDeclaration':
      {
        if (opts.default) {
          throw (0, _ErrorUtils.translationError)(decl, 'ExportDeclaration: Default VariableDeclaration found, invalid AST.', context);
        }

        const [declDecl, deps] = convertVariableDeclaration(decl, context);
        return [_hermesTransform.t.DeclareExportDeclarationNamedWithDeclaration({
          declaration: declDecl
        }), deps];
      }

    case 'EnumDeclaration':
      {
        return [_hermesTransform.t.ExportNamedDeclarationWithDeclaration({
          exportKind: 'value',
          declaration: (0, _hermesTransform.asDetachedNode)(decl)
        }), []];
      }

    default:
      {
        if ((0, _hermesEstree.isExpression)(decl)) {
          if (!opts.default) {
            throw (0, _ErrorUtils.translationError)(decl, 'ExportDeclaration: Non default expression found, invalid AST.', context);
          }

          const [declDecl, deps] = convertExpressionToTypeAnnotation(decl, context);
          return [_hermesTransform.t.DeclareExportDefaultDeclaration({
            declaration: declDecl
          }), deps];
        }

        throw (0, _ErrorUtils.translationError)(decl, `ExportDeclaration: Unsupported declaration of type "${decl.type}".`, context);
      }
  }
}

function convertExportDefaultDeclaration(stmt, context) {
  const expr = stmt.declaration;

  if ((0, _hermesEstree.isExpression)(expr) && expr.type === 'Identifier') {
    const name = expr.name;
    const [declDecl, deps] = [_hermesTransform.t.TypeofTypeAnnotation({
      argument: _hermesTransform.t.Identifier({
        name
      })
    }), (0, _FlowAnalyze.analyzeTypeDependencies)(expr, context)];
    return [_hermesTransform.t.DeclareExportDefaultDeclaration({
      declaration: declDecl
    }), deps];
  }

  return convertExportDeclaration(stmt.declaration, {
    default: true
  }, context);
}

function convertExportNamedDeclaration(stmt, context) {
  const decl = stmt.declaration;

  if (decl != null) {
    return convertExportDeclaration(decl, {
      default: false
    }, context);
  }

  const resultSpecfiers = stmt.specifiers.map(spec => (0, _hermesTransform.asDetachedNode)(spec));
  const specifiersDeps = stmt.source != null ? [] : stmt.specifiers.flatMap(({
    local
  }) => (0, _FlowAnalyze.analyzeTypeDependencies)(local, context));
  return [_hermesTransform.t.ExportNamedDeclarationWithSpecifiers({
    exportKind: stmt.exportKind,
    source: (0, _hermesTransform.asDetachedNode)(stmt.source),
    specifiers: resultSpecfiers
  }), specifiersDeps];
}

function convertVariableDeclaration(stmt, context) {
  const [first, ...rest] = stmt.declarations;

  if (rest.length > 0) {
    throw (0, _ErrorUtils.translationError)(stmt, `VariableDeclaration: more than one VariableDeclarators found`, context);
  }

  const id = first.id;

  if (id.type !== 'Identifier') {
    throw (0, _ErrorUtils.translationError)(id, `VariableDeclaration: unsupported destructing`, context);
  }

  const [resultTypeAnnotation, annotDeps] = (() => {
    if (id.typeAnnotation != null) {
      return convertTypeAnnotation(id.typeAnnotation, id, context);
    }

    const init = first.init;

    if (init == null) {
      return [(0, _ErrorUtils.flowFixMeOrError)(first, `VariableDeclaration: Type annotation missing`, context), []];
    }

    if (init.type === 'Identifier') {
      return [_hermesTransform.t.TypeofTypeAnnotation({
        argument: _hermesTransform.t.Identifier({
          name: init.name
        })
      }), (0, _FlowAnalyze.analyzeTypeDependencies)(init, context)];
    }

    return convertExpressionToTypeAnnotation(init, context);
  })();

  return [_hermesTransform.t.DeclareVariable({
    id: _hermesTransform.t.Identifier({
      name: id.name,
      typeAnnotation: _hermesTransform.t.TypeAnnotation({
        typeAnnotation: resultTypeAnnotation
      }),
      optional: false
    }),
    kind: stmt.kind
  }), annotDeps];
}

function convertImportDeclaration(stmt, context) {
  if (stmt.assertions.length > 0) {
    throw (0, _ErrorUtils.translationError)(stmt, 'ImportDeclaration: assertions not supported', context);
  }

  return [_hermesTransform.t.ImportDeclaration({
    specifiers: stmt.specifiers,
    importKind: stmt.importKind,
    source: stmt.source,
    assertions: []
  }), []];
}

function convertInterfaceDeclaration(interface_, context) {
  return [(0, _hermesTransform.asDetachedNode)(interface_), (0, _FlowAnalyze.analyzeTypeDependencies)(interface_, context)];
}

function convertClassDeclaration(class_, context) {
  const [resultTypeParams, typeParamsDeps] = convertTypeParameterDeclarationOrNull(class_.typeParameters, context);
  const implementsDeps = class_.implements.flatMap(impl => (0, _FlowAnalyze.analyzeTypeDependencies)(impl, context));
  const [resultSuperClass, superClassDeps] = convertSuperClass(class_.superClass, class_.superTypeParameters, context);
  const [resultClassBody, bodyDeps] = convertClassBody(class_.body, context);

  if (class_.decorators.length > 0) {
    throw (0, _ErrorUtils.translationError)(class_, 'ClassDeclaration: decorators not supported', context);
  }

  return [_hermesTransform.t.DeclareClass({
    // $FlowFixMe[incompatible-call]
    id: (0, _hermesTransform.asDetachedNode)(class_.id),
    typeParameters: resultTypeParams,
    implements: class_.implements.map(impl => (0, _hermesTransform.asDetachedNode)(impl)),
    extends: resultSuperClass == null ? [] : [resultSuperClass],
    mixins: [],
    body: resultClassBody
  }), [...typeParamsDeps, ...implementsDeps, ...superClassDeps, ...bodyDeps]];
}

function convertSuperClass(superClass, superTypeParameters, context) {
  if (superClass == null) {
    return EMPTY_TRANSLATION_RESULT;
  }

  if (superClass.type !== 'Identifier') {
    throw (0, _ErrorUtils.translationError)(superClass, `SuperClass: Non identifier super type of "${superClass.type}" not supported`, context);
  }

  const [resultTypeParams, typeParamsDeps] = convertTypeParameterInstantiationOrNull(superTypeParameters, context);
  const superDeps = (0, _FlowAnalyze.analyzeTypeDependencies)(superClass, context);
  return [_hermesTransform.t.InterfaceExtends({
    id: (0, _hermesTransform.asDetachedNode)(superClass),
    typeParameters: resultTypeParams
  }), [...typeParamsDeps, ...superDeps]];
}

function convertClassBody(body, context) {
  const [resultProperties, deps] = convertArray(body.body, member => convertClassMember(member, context));
  return [_hermesTransform.t.ObjectTypeAnnotation({
    inexact: false,
    exact: false,
    properties: resultProperties,
    indexers: [],
    callProperties: [],
    internalSlots: []
  }), deps];
}

function convertClassMember(member, context) {
  switch (member.type) {
    case 'PropertyDefinition':
      {
        // PrivateIdentifier's are not exposed so can be stripped.
        if (member.key.type === 'PrivateIdentifier') {
          return EMPTY_TRANSLATION_RESULT;
        }

        if (!(0, _hermesEstree.isIdentifier)(member.key) && !(0, _hermesEstree.isStringLiteral)(member.key) && !(0, _hermesEstree.isNumericLiteral)(member.key)) {
          throw (0, _ErrorUtils.translationError)(member.key, `ClassMember PropertyDefinition: Unsupported key type of "${member.key.type}"`, context);
        }

        const [resultTypeAnnotation, deps] = convertTypeAnnotation(member.typeAnnotation, member, context);
        return [_hermesTransform.t.ObjectTypePropertySignature({
          // $FlowFixMe[incompatible-call]
          key: (0, _hermesTransform.asDetachedNode)(member.key),
          value: resultTypeAnnotation,
          optional: member.optional,
          static: member.static,
          variance: member.variance
        }), deps];
      }

    case 'MethodDefinition':
      {
        // PrivateIdentifier's are not exposed so can be stripped.
        if (member.key.type === 'PrivateIdentifier') {
          return EMPTY_TRANSLATION_RESULT;
        }

        if (!(0, _hermesEstree.isIdentifier)(member.key) && !(0, _hermesEstree.isStringLiteral)(member.key) && !(0, _hermesEstree.isNumericLiteral)(member.key)) {
          throw (0, _ErrorUtils.translationError)(member.key, `ClassMember PropertyDefinition: Unsupported key type of "${member.key.type}"`, context);
        }

        const [resultValue, deps] = convertAFunction(member.value, context);

        if (member.kind === 'get' || member.kind === 'set') {
          // accessors are methods - but flow accessor signatures are properties
          const kind = member.kind;
          return [_hermesTransform.t.ObjectTypeAccessorSignature({
            // $FlowFixMe[incompatible-call]
            key: (0, _hermesTransform.asDetachedNode)(member.key),
            value: resultValue,
            static: member.static,
            kind
          }), deps];
        }

        return [_hermesTransform.t.ObjectTypeMethodSignature({
          // $FlowFixMe[incompatible-call]
          key: (0, _hermesTransform.asDetachedNode)(member.key),
          value: resultValue,
          static: member.static
        }), deps];
      }

    default:
      {
        throw (0, _ErrorUtils.translationError)(member, `ClassMember: Unsupported member type of "${member.type}"`, context);
      }
  }
}

function convertComponentDeclaration(comp, context) {
  const [resultTypeParams, typeParamsDeps] = convertTypeParameterDeclarationOrNull(comp.typeParameters, context);
  const [resultParams, resultRestParam, paramsAndRestDeps] = convertComponentParameters(comp.params, context);

  const [resultRendersType, rendersTypeDeps] = (() => {
    const rendersType = comp.rendersType;

    if (rendersType == null) {
      return EMPTY_TRANSLATION_RESULT;
    }

    return [(0, _hermesTransform.asDetachedNode)(rendersType), (0, _FlowAnalyze.analyzeTypeDependencies)(rendersType, context)];
  })();

  return [_hermesTransform.t.DeclareComponent({
    id: comp.id,
    params: resultParams,
    rest: resultRestParam,
    typeParameters: resultTypeParams,
    rendersType: resultRendersType
  }), [...typeParamsDeps, ...paramsAndRestDeps, ...rendersTypeDeps]];
}

function convertComponentParameters(params, context) {
  return params.reduce(([resultParams, restParam, paramsDeps], param) => {
    switch (param.type) {
      case 'ComponentParameter':
        {
          let optional = false;
          let local = param.local;

          if (local.type === 'AssignmentPattern') {
            local = local.left;
            optional = true;
          }

          if (!optional && local.type === 'Identifier') {
            optional = local.optional;
          }

          const [typeAnnotationType, typeDeps] = convertTypeAnnotation(local.typeAnnotation, param, context);

          const resultParam = _hermesTransform.t.ComponentTypeParameter({
            name: (0, _hermesTransform.asDetachedNode)(param.name),
            typeAnnotation: typeAnnotationType,
            optional
          });

          return [[...resultParams, resultParam], restParam, [...paramsDeps, ...typeDeps]];
        }

      case 'RestElement':
        {
          if (restParam != null) {
            throw (0, _ErrorUtils.translationError)(param, `ComponentParameter: Multiple rest elements found`, context);
          }

          const argument = param.argument;

          if (argument.type === 'AssignmentPattern' || argument.type === 'ArrayPattern' || argument.type === 'RestElement') {
            throw (0, _ErrorUtils.translationError)(param, `ComponentParameter: Invalid RestElement usage`, context);
          }

          const [typeAnnotationType, typeDeps] = convertTypeAnnotation(argument.typeAnnotation, argument, context);

          const resultRestParam = _hermesTransform.t.ComponentTypeParameter({
            name: _hermesTransform.t.Identifier({
              name: argument.type === 'Identifier' ? argument.name : 'rest'
            }),
            typeAnnotation: typeAnnotationType,
            optional: argument.type === 'Identifier' ? argument.optional : false
          });

          return [resultParams, resultRestParam, [...paramsDeps, ...typeDeps]];
        }
    }
  }, [[], null, []]);
}

function convertHookDeclaration(hook, context) {
  var _hook$returnType;

  const id = hook.id;
  const returnType = (_hook$returnType = hook.returnType) != null ? _hook$returnType : // $FlowFixMe[incompatible-type]
  _hermesTransform.t.TypeAnnotation({
    typeAnnotation: _hermesTransform.t.VoidTypeAnnotation()
  });
  const [resultReturnType, returnDeps] = convertTypeAnnotation(returnType, hook, context);
  const [resultParams, restParam, paramsDeps] = convertFunctionParameters(hook.params, context);
  const [resultTypeParams, typeParamsDeps] = convertTypeParameterDeclarationOrNull(hook.typeParameters, context);

  const resultFunc = _hermesTransform.t.FunctionTypeAnnotation({
    params: resultParams,
    returnType: resultReturnType,
    rest: restParam,
    typeParameters: resultTypeParams
  });

  const funcDeps = [...paramsDeps, ...returnDeps, ...typeParamsDeps];
  return [_hermesTransform.t.DeclareHook({
    name: id.name,
    functionType: resultFunc
  }), [...funcDeps]];
}

function convertFunctionDeclaration(func, context) {
  const id = func.id;

  if (id == null) {
    throw (0, _ErrorUtils.translationError)(func, `FunctionDeclaration: Missing name`, context);
  }

  const [resultFunc, funcDeps] = convertAFunction(func, context);

  const [resultPredicate, predicateDeps] = (() => {
    if (func.predicate == null) {
      return EMPTY_TRANSLATION_RESULT;
    }

    const body = func.body.body;
    const predicateExpr = body.length === 1 && body[0].type === 'ReturnStatement' && body[0].argument != null ? body[0].argument : null;

    if (predicateExpr == null) {
      throw (0, _ErrorUtils.translationError)(func, 'FunctionDeclation: Invalid predicate function.', context);
    }

    return [_hermesTransform.t.DeclaredPredicate({
      value: (0, _hermesTransform.asDetachedNode)(predicateExpr)
    }), (0, _FlowAnalyze.analyzeTypeDependencies)(predicateExpr, context)];
  })();

  return [_hermesTransform.t.DeclareFunction({
    name: id.name,
    functionType: resultFunc,
    predicate: resultPredicate
  }), [...funcDeps, ...predicateDeps]];
}

function convertAFunction(func, context) {
  const returnType = (0, _FlowAnalyze.analyzeFunctionReturn)(func);
  const [resultReturnType, returnDeps] = convertTypeAnnotation(returnType, func, context);
  const [resultParams, restParam, paramsDeps] = convertFunctionParameters(func.params, context);
  const [resultTypeParams, typeParamsDeps] = convertTypeParameterDeclarationOrNull(func.typeParameters, context);
  return [_hermesTransform.t.FunctionTypeAnnotation({
    params: resultParams,
    returnType: resultReturnType,
    rest: restParam,
    typeParameters: resultTypeParams
  }), [...paramsDeps, ...returnDeps, ...typeParamsDeps]];
}

function convertFunctionParameters(params, context) {
  return params.reduce(([resultParams, restParam, paramsDeps], param) => {
    switch (param.type) {
      case 'Identifier':
      case 'ArrayPattern':
      case 'ObjectPattern':
        {
          const [resultParam, deps] = convertBindingNameToFunctionTypeParam(param, context);
          return [[...resultParams, resultParam], restParam, [...paramsDeps, ...deps]];
        }

      case 'AssignmentPattern':
        {
          const [resultParam, deps] = convertBindingNameToFunctionTypeParam(param.left, context);
          return [[...resultParams, resultParam], restParam, [...paramsDeps, ...deps]];
        }

      case 'RestElement':
        {
          if (restParam != null) {
            throw (0, _ErrorUtils.translationError)(param, `FunctionParameter: Multiple rest elements found`, context);
          }

          const [resultParam, deps] = convertBindingNameToFunctionTypeParam( // $FlowFixMe[incompatible-call] I dont think these other cases are possible
          param.argument, context);
          return [resultParams, resultParam, [...paramsDeps, ...deps]];
        }
    }
  }, [[], null, []]);
}

function convertBindingNameToFunctionTypeParam(pat, context) {
  const name = pat.type === 'Identifier' ? pat.name : null;
  const [resultParamTypeAnnotation, paramDeps] = convertTypeAnnotation(pat.typeAnnotation, pat, context);
  return [_hermesTransform.t.FunctionTypeParam({
    name: name != null ? _hermesTransform.t.Identifier({
      name
    }) : null,
    typeAnnotation: resultParamTypeAnnotation,
    optional: pat.type === 'Identifier' ? pat.optional : false
  }), paramDeps];
}

function convertTypeAlias(typeAlias, context) {
  const [typeAnnotationType, rightDeps] = convertTypeAnnotationType(typeAlias.right, typeAlias, context);
  const [typeParameters, typeParamsDeps] = convertTypeParameterDeclarationOrNull(typeAlias.typeParameters, context);
  return [_hermesTransform.t.TypeAlias({
    right: typeAnnotationType,
    id: (0, _hermesTransform.asDetachedNode)(typeAlias.id),
    typeParameters
  }), [...rightDeps, ...typeParamsDeps]];
}

function convertOpaqueType(opaqueType, context) {
  const [resultSupertype, supertypeDeps] = convertTypeAnnotationTypeOrNull(opaqueType.supertype, context);
  const [typeParameters, typeParamsDeps] = convertTypeParameterDeclarationOrNull(opaqueType.typeParameters, context);
  return [_hermesTransform.t.DeclareOpaqueType({
    id: (0, _hermesTransform.asDetachedNode)(opaqueType.id),
    typeParameters,
    supertype: resultSupertype
  }), [...typeParamsDeps, ...supertypeDeps]];
}

function convertAsExpression(asExpression, context) {
  return convertTypeAnnotationType(asExpression.typeAnnotation, asExpression, context);
}

function convertTypeCastExpression(typeCast, context) {
  return convertTypeAnnotation(typeCast.typeAnnotation, typeCast, context);
}

function convertTypeAnnotation(annot, container, context) {
  return convertTypeAnnotationType(annot == null ? void 0 : annot.typeAnnotation, container, context);
}

function convertTypeAnnotationType(annot, container, context) {
  if (annot == null) {
    return [(0, _ErrorUtils.flowFixMeOrError)(container, `TypeAnnotationType: Type annotation missing`, context), []];
  }

  return [(0, _hermesTransform.asDetachedNode)(annot), (0, _FlowAnalyze.analyzeTypeDependencies)(annot, context)];
}

function convertTypeAnnotationTypeOrNull(annot, context) {
  if (annot == null) {
    return EMPTY_TRANSLATION_RESULT;
  }

  return [(0, _hermesTransform.asDetachedNode)(annot), (0, _FlowAnalyze.analyzeTypeDependencies)(annot, context)];
}

function convertTypeParameterDeclarationOrNull(decl, context) {
  if (decl == null) {
    return EMPTY_TRANSLATION_RESULT;
  }

  return [(0, _hermesTransform.asDetachedNode)(decl), (0, _FlowAnalyze.analyzeTypeDependencies)(decl, context)];
}

function convertTypeParameterInstantiationOrNull(inst, context) {
  if (inst == null) {
    return EMPTY_TRANSLATION_RESULT;
  }

  return [(0, _hermesTransform.asDetachedNode)(inst), (0, _FlowAnalyze.analyzeTypeDependencies)(inst, context)];
}