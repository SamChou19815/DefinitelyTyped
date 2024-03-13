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
exports.TSDefToFlowDef = TSDefToFlowDef;

var FlowESTree = _interopRequireWildcard(require("hermes-estree"));

var TSESTree = _interopRequireWildcard(require("./utils/ts-estree-ast-types"));

var _hermesTransform = require("hermes-transform");

var _ErrorUtils = require("./utils/ErrorUtils");

var _os = require("os");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const DUMMY_LOC = null;
const DUMMY_RANGE = [0, 0];
const DUMMY_PARENT = null;
const DUMMY_COMMON = {
  loc: DUMMY_LOC,
  range: DUMMY_RANGE,
  parent: DUMMY_PARENT
};

function constructFlowNode(node) {
  return { ...node,
    ...DUMMY_COMMON
  };
}

const makeCommentOwnLine = // $FlowExpectedError[incompatible-cast] - trust me this re-type is 100% safe
_hermesTransform.makeCommentOwnLine;

function TSDefToFlowDef(originalCode, ast, opts) {
  const flowBody = [];
  const flowProgram = { ...DUMMY_COMMON,
    type: 'Program',
    body: flowBody,
    comments: [],
    sourceType: ast.sourceType,
    interpreter: null,
    tokens: [],
    loc: ast.loc,
    docblock: {
      comment: { ...DUMMY_COMMON,
        type: 'Block',
        value: ''
      },
      directives: {
        flow: []
      }
    }
  };
  const [transform, code] = getTransforms(originalCode, opts);

  for (const node of ast.body) {
    const result = transform.AllStatement(node);
    flowBody.push(...(Array.isArray(result) ? result : [result]));
  }

  return [flowProgram, code];
} // Note: The implementation here is still in early stage. If something is not supported, it doesn't
// necessarily mean that it cannot be. It might just mean that it's not priortized yet. If something
// is translated in way that is wrong, then it's likely wrong.


const getTransforms = (originalCode, opts) => {
  let code = originalCode;

  function translationError(node, message) {
    return (0, _ErrorUtils.translationError)(node, message, {
      code
    });
  }

  function unexpectedTranslationError(node, message) {
    return (0, _ErrorUtils.unexpectedTranslationError)(node, message, {
      code
    });
  }

  function unsupportedFeatureMessage(thing) {
    return `Unsupported feature: Translating "${thing}" is currently not supported.`;
  }

  function buildCodeFrameForComment(node, message) {
    return (0, _ErrorUtils.buildCodeFrame)(node, message, code, false);
  }

  function addErrorComment(node, message) {
    var _node$comments;

    const comment = {
      type: 'Block',
      loc: DUMMY_LOC,
      value: `*${_os.EOL} * ${message.replace(new RegExp(_os.EOL, 'g'), `${_os.EOL} * `)}${_os.EOL}*`,
      leading: true,
      printed: false
    };
    code = makeCommentOwnLine(code, comment); // $FlowExpectedError[prop-missing]
    // $FlowExpectedError[cannot-write]

    (_node$comments = node.comments) != null ? _node$comments : node.comments = []; // $FlowExpectedError[incompatible-cast]

    node.comments.push(comment);
  }

  function unsupportedAnnotation(node, thing) {
    const message = unsupportedFeatureMessage(thing);

    if (opts.recoverFromErrors) {
      const codeFrame = buildCodeFrameForComment(node, message);
      const newNode = { ...DUMMY_COMMON,
        type: 'AnyTypeAnnotation'
      };
      addErrorComment(newNode, codeFrame);
      return newNode;
    }

    throw translationError(node, message);
  }

  function unsupportedDeclaration(node, thing, id, typeParameters = null) {
    const message = unsupportedFeatureMessage(thing);

    if (opts.recoverFromErrors) {
      const codeFrame = buildCodeFrameForComment(node, message);
      const newNode = { ...DUMMY_COMMON,
        type: 'TypeAlias',
        id: Transform.Identifier(id, false),
        right: { ...DUMMY_COMMON,
          type: 'AnyTypeAnnotation'
        },
        typeParameters: Transform.TSTypeParameterDeclarationOpt(typeParameters)
      };
      addErrorComment(newNode, codeFrame);
      return newNode;
    }

    throw translationError(node, message);
  }

  class Transform {
    static BlockStatement(node) {
      return constructFlowNode({
        type: 'BlockStatement',
        body: node.body.flatMap(node => Transform.Statement(node))
      });
    }

    static ClassDeclarationWithName(node) {
      return constructFlowNode({
        type: 'DeclareClass',
        id: Transform.Identifier(node.id),
        typeParameters: Transform.TSTypeParameterDeclarationOpt(node.typeParameters),
        implements: (node.implements || []).map(impl => Transform.ClassImplements(impl)),
        extends: Transform.ClassDeclarationSuperClass(node.superClass, node.superTypeParameters),
        mixins: [],
        body: Transform.ClassDeclarationBody(node.body)
      });
    }

    static ClassDeclarationBody({
      body
    }) {
      const properties = [];
      const indexers = [];

      for (const classItem of body) {
        switch (classItem.type) {
          case 'StaticBlock':
            break;

          case 'TSIndexSignature':
            break;

          case 'TSAbstractPropertyDefinition':
          case 'PropertyDefinition':
            // $FlowFixMe[incompatible-call] ambiguous node
            Transform._translateIntoObjectProp(classItem, properties, indexers);

            break;

          case 'MethodDefinition':
          case 'TSAbstractMethodDefinition':
            // $FlowFixMe[incompatible-call] ambiguous node
            Transform._translateIntoObjectMethod(classItem, properties);

            break;
        }
      }

      return constructFlowNode({
        type: 'ObjectTypeAnnotation',
        properties,
        indexers,
        callProperties: [],
        internalSlots: [],
        exact: false,
        inexact: false
      });
    }

    static ClassDeclarationSuperClass(superClass, superTypeParameters) {
      if (superClass == null) {
        return [];
      }

      const id = Transform._expressionToIdOrQualifiedTypeId(superClass, 'superClass');

      return [constructFlowNode({
        type: 'InterfaceExtends',
        id,
        typeParameters: Transform.TSTypeParameterInstantiationOpt(superTypeParameters)
      })];
    }

    static ClassImplements(node) {
      if (node.expression.type !== 'Identifier') {
        throw unexpectedTranslationError(node, 'Expected expression to be an Identifier');
      }

      return constructFlowNode({
        type: 'ClassImplements',
        id: Transform.Identifier(node.expression),
        typeParameters: Transform.TSTypeParameterInstantiationOpt(node.typeParameters)
      });
    }

    static DebuggerStatement() {
      return constructFlowNode({
        type: 'DebuggerStatement'
      });
    }

    static EntityNameToTypeIdentifier(node) {
      switch (node.type) {
        case 'Identifier':
          return Transform.Identifier(node);

        case 'TSQualifiedName':
          return Transform.TSQualifiedNameToQualifiedTypeIdentifier(node);

        case 'ThisExpression':
          return constructFlowNode({
            type: 'Identifier',
            name: 'this',
            typeAnnotation: null,
            optional: false
          });
      }
    }

    static EntityNameToTypeofIdentifier(node) {
      switch (node.type) {
        case 'Identifier':
          return Transform.Identifier(node);

        case 'TSQualifiedName':
          return Transform.TSQualifiedNameToQualifiedTypeofIdentifier(node);

        case 'ThisExpression':
          return constructFlowNode({
            type: 'Identifier',
            name: 'this',
            typeAnnotation: null,
            optional: false
          });
      }
    }

    static ExportAllDeclaration(node) {
      return constructFlowNode({
        type: 'ExportAllDeclaration',
        source: constructFlowNode({
          type: 'Literal',
          literalType: 'string',
          value: node.source.value,
          raw: node.source.raw
        }),
        assertions: [],
        exportKind: node.exportKind,
        exported: node.exported != null ? Transform.Identifier(node.exported) : null
      });
    }

    static ExportDefaultDeclaration(node) {
      let declaration;

      switch (node.declaration.type) {
        case 'ClassDeclaration':
          declaration = Transform.ClassDeclarationWithName( // possibly missing id
          node.declaration);
          break;

        case 'FunctionDeclaration':
          declaration = Transform.FunctionDeclarationWithName( // possibly missing id
          node.declaration);
          break;

        case 'TSDeclareFunction':
          declaration = Transform.TSDeclareFunction(node.declaration);
          break;

        case 'Identifier':
          declaration = constructFlowNode({
            type: 'TypeofTypeAnnotation',
            argument: Transform.Identifier(node.declaration)
          });
          break;

        default:
          throw translationError(node.declaration, `Unsupported export declaration: ${node.declaration.type}`);
      }

      return constructFlowNode({
        type: 'DeclareExportDeclaration',
        declaration,
        default: true,
        source: null,
        specifiers: []
      });
    }

    static ExportNamedDeclaration(node) {
      if (node.declaration == null) {
        const source = node.source == null ? null : constructFlowNode({
          type: 'Literal',
          literalType: 'string',
          value: node.source.value,
          raw: node.source.raw
        });
        const specifiers = node.specifiers.map(specifier => constructFlowNode({
          type: 'ExportSpecifier',
          local: Transform.Identifier(specifier.local),
          exported: Transform.Identifier(specifier.exported)
        }));
        return constructFlowNode({
          type: 'DeclareExportDeclaration',
          declaration: null,
          default: false,
          source,
          specifiers
        });
      }

      switch (node.declaration.type) {
        case 'ClassDeclaration':
          return constructFlowNode({
            type: 'DeclareExportDeclaration',
            declaration: Transform.ClassDeclarationWithName( // possibly missing id
            node.declaration),
            default: false,
            source: null,
            specifiers: []
          });

        case 'FunctionDeclaration':
          return constructFlowNode({
            type: 'DeclareExportDeclaration',
            declaration: Transform.FunctionDeclarationWithName( // possibly missing id
            node.declaration),
            default: false,
            source: null,
            specifiers: []
          });

        case 'TSDeclareFunction':
          return constructFlowNode({
            type: 'DeclareExportDeclaration',
            declaration: Transform.TSDeclareFunction(node.declaration),
            default: false,
            source: null,
            specifiers: []
          });

        case 'TSEnumDeclaration':
          throw translationError(node.declaration, `Unsupported export declaration: ${node.declaration.type}`);

        case 'TSModuleDeclaration':
          {
            const decl = Transform.TSModuleDeclaration(node.declaration);

            if (decl.id.type !== 'Identifier') {
              throw translationError(decl.id, `Unsupported module declaration id`);
            }

            return [decl, constructFlowNode({
              type: 'ExportNamedDeclaration',
              declaration: null,
              source: null,
              exportKind: 'value',
              specifiers: [constructFlowNode({
                type: 'ExportSpecifier',
                local: decl.id,
                exported: decl.id
              })]
            })];
          }

        case 'TSInterfaceDeclaration':
          {
            const decl = Transform.TSInterfaceDeclaration(node.declaration);

            if (Transform.inDeclareModule) {
              return constructFlowNode({
                type: 'DeclareExportDeclaration',
                declaration: constructFlowNode({
                  type: 'DeclareInterface',
                  id: decl.id,
                  typeParameters: decl.typeParameters,
                  body: decl.body,
                  extends: decl.extends
                }),
                default: false,
                source: null,
                specifiers: []
              });
            } else {
              return constructFlowNode({
                type: 'ExportNamedDeclaration',
                source: null,
                exportKind: 'type',
                declaration: decl,
                specifiers: []
              });
            }
          }

        case 'TSTypeAliasDeclaration':
          {
            const decl = Transform.TSTypeAliasDeclaration(node.declaration);
            return constructFlowNode({
              type: 'ExportNamedDeclaration',
              declaration: decl,
              source: null,
              exportKind: 'type',
              specifiers: []
            });
          }

        case 'VariableDeclaration':
          {
            return Transform.VariableDeclaration(node.declaration).map(declaration => constructFlowNode({
              type: 'DeclareExportDeclaration',
              declaration,
              default: false,
              source: null,
              specifiers: []
            }));
          }
      }
    }

    static FunctionDeclarationWithName(node) {
      var _node$returnType;

      const {
        thisParam,
        restParam,
        params
      } = Transform._partitionAndTranslateTSFunctionParams(node.params);

      const fnAnnot = constructFlowNode({
        type: 'FunctionTypeAnnotation',
        typeParameters: Transform.TSTypeParameterDeclarationOpt(node.typeParameters),
        params,
        rest: restParam,
        returnType: ((_node$returnType = node.returnType) == null ? void 0 : _node$returnType.typeAnnotation) == null ? unsupportedAnnotation(node, 'missing return type') : Transform.TSTypeAnnotation(node.returnType.typeAnnotation),
        this: thisParam
      });
      return constructFlowNode({
        type: 'DeclareFunction',
        id: { ...DUMMY_COMMON,
          type: 'Identifier',
          name: node.id.name,
          typeAnnotation: { ...DUMMY_COMMON,
            type: 'TypeAnnotation',
            typeAnnotation: fnAnnot
          },
          optional: false
        },
        predicate: null
      });
    }

    static Identifier(node, optional) {
      return constructFlowNode({
        type: 'Identifier',
        name: node.name,
        typeAnnotation: node.typeAnnotation != null ? Transform.TSTypeAnnotationNode(node.typeAnnotation) : null,
        optional: Boolean(optional != null ? optional : node.optional)
      });
    }

    static ImportDeclaration(node) {
      const specifiers = node.specifiers.map(specifier => {
        var _specifier$importKind;

        switch (specifier.type) {
          case 'ImportNamespaceSpecifier':
            return constructFlowNode({
              type: 'ImportNamespaceSpecifier',
              local: Transform.Identifier(specifier.local)
            });

          case 'ImportDefaultSpecifier':
            return constructFlowNode({
              type: 'ImportDefaultSpecifier',
              local: Transform.Identifier(specifier.local)
            });

          case 'ImportSpecifier':
            return constructFlowNode({
              type: 'ImportSpecifier',
              local: Transform.Identifier(specifier.local),
              imported: Transform.Identifier(specifier.imported),
              importKind: specifier.importKind === 'value' ? null : (_specifier$importKind = specifier.importKind) != null ? _specifier$importKind : null
            });
        }
      });
      return constructFlowNode({
        type: 'ImportDeclaration',
        source: constructFlowNode({
          type: 'Literal',
          literalType: 'string',
          value: node.source.value,
          raw: node.source.raw
        }),
        importKind: // `import type React from 'react'` in TS means `import typeof React from react` in Flow
        specifiers.some(s => s.type === 'ImportDefaultSpecifier') && node.importKind === 'type' ? 'typeof' : node.importKind,
        assertions: [],
        specifiers
      });
    }

    static LabeledStatement(node) {
      const body = Transform.Statement(node.body);

      if (Array.isArray(body)) {
        throw translationError(node.body, 'Unexpected array of statements');
      }

      return constructFlowNode({
        type: 'LabeledStatement',
        label: Transform.Identifier(node.label),
        body
      });
    }

    static Literal(node) {
      if (typeof node.value === 'number') {
        return constructFlowNode({
          type: 'Literal',
          literalType: 'numeric',
          value: Number(node.raw),
          raw: node.raw
        });
      } else if (typeof node.value === 'string') {
        return constructFlowNode({
          type: 'Literal',
          literalType: 'string',
          value: node.value,
          raw: node.raw
        });
      } else if (typeof node.value === 'boolean') {
        return constructFlowNode({
          type: 'Literal',
          literalType: 'boolean',
          value: node.value,
          raw: node.value ? 'true' : 'false'
        });
      } else if (typeof node.value === 'bigint') {
        return constructFlowNode({
          type: 'Literal',
          literalType: 'bigint',
          value: node.value,
          raw: node.raw,
          bigint: node.raw
        });
      } else if (node.value instanceof RegExp) {
        return constructFlowNode({
          type: 'Literal',
          literalType: 'regexp',
          value: node.value,
          regex: null,
          raw: node.raw
        });
      } else if (node.value == null) {
        return constructFlowNode({
          type: 'Literal',
          literalType: 'null',
          value: node.value,
          raw: 'null'
        });
      } else {
        throw translationError(node, `Unsupported literal type ${typeof node.value}`);
      }
    }

    static LiteralType(node) {
      const literal = Transform.Literal(node);

      switch (literal.literalType) {
        case 'boolean':
          return constructFlowNode({
            type: 'BooleanLiteralTypeAnnotation',
            value: literal.value,
            raw: literal.raw
          });

        case 'numeric':
          return constructFlowNode({
            type: 'NumberLiteralTypeAnnotation',
            value: literal.value,
            raw: literal.raw
          });

        case 'string':
          return constructFlowNode({
            type: 'StringLiteralTypeAnnotation',
            value: literal.value,
            raw: literal.raw
          });

        case 'bigint':
          return constructFlowNode({
            type: 'BigIntLiteralTypeAnnotation',
            value: literal.value,
            bigint: literal.bigint,
            raw: literal.raw
          });

        case 'null':
          return constructFlowNode({
            type: 'NullLiteralTypeAnnotation',
            value: literal.value,
            raw: literal.raw
          });

        case 'regexp':
          return unsupportedAnnotation(node, 'regexp literal type');

        default:
          literal;
          throw 'unreachable';
      }
    }

    static AllStatement(node) {
      switch (node.type) {
        case 'BlockStatement':
          return Transform.BlockStatement(node);

        case 'ClassDeclaration':
          return Transform.ClassDeclarationWithName(node);

        case 'DebuggerStatement':
          return Transform.DebuggerStatement();

        case 'ExportAllDeclaration':
          return Transform.ExportAllDeclaration(node);

        case 'ExportDefaultDeclaration':
          return Transform.ExportDefaultDeclaration(node);

        case 'ExportNamedDeclaration':
          return Transform.ExportNamedDeclaration(node);

        case 'FunctionDeclaration':
          return Transform.FunctionDeclarationWithName(node);

        case 'ImportDeclaration':
          return Transform.ImportDeclaration(node);

        case 'LabeledStatement':
          return Transform.LabeledStatement(node);

        case 'TSDeclareFunction':
          return Transform.TSDeclareFunction(node);

        case 'TSEnumDeclaration':
          return Transform.TSEnumDeclaration(node);

        case 'TSExportAssignment':
          return Transform.TSExportAssignment(node);

        case 'TSImportEqualsDeclaration':
          return Transform.TSImportEqualsDeclaration(node);

        case 'TSInterfaceDeclaration':
          return Transform.TSInterfaceDeclaration(node);

        case 'TSModuleDeclaration':
          return Transform.TSModuleDeclaration(node);

        case 'TSNamespaceExportDeclaration':
          // Flow will never support `export as namespace` since we can't allow a normal file to
          // introduce a global out of nowhere, and because it's only useful for legacy module
          // system However, it's very reasonable to completely ignore it under some mode, so that
          // people using these libdefs won't have a lot of pain.
          return [];

        case 'TSTypeAliasDeclaration':
          return Transform.TSTypeAliasDeclaration(node);

        case 'VariableDeclaration':
          return Transform.VariableDeclaration(node);

        case 'ExpressionStatement':
          throw translationError(node, 'Unsupported expression statement');

        case 'WithStatement':
          throw translationError(node, 'Unsupported with statement');

        case 'BreakStatement':
        case 'ContinueStatement':
        case 'DoWhileStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'ForStatement':
        case 'IfStatement':
        case 'ReturnStatement':
        case 'SwitchStatement':
        case 'ThrowStatement':
        case 'TryStatement':
        case 'WhileStatement':
          throw translationError(node, 'Unsupported control flow statement');
      }
    }

    static Statement(node) {
      return Transform.AllStatement(node);
    }

    static TSAnyType() {
      return constructFlowNode({
        type: 'AnyTypeAnnotation'
      });
    }

    static TSArrayType(node) {
      return constructFlowNode({
        type: 'ArrayTypeAnnotation',
        elementType: Transform.TSTypeAnnotation(node.elementType)
      });
    }

    static TSBigIntType() {
      return constructFlowNode({
        type: 'BigIntTypeAnnotation'
      });
    }

    static TSBooleanType() {
      return constructFlowNode({
        type: 'BooleanTypeAnnotation'
      });
    }

    static TSConditionalType(node) {
      return constructFlowNode({
        type: 'ConditionalTypeAnnotation',
        checkType: Transform.TSTypeAnnotation(node.checkType),
        extendsType: Transform.TSTypeAnnotation(node.extendsType),
        trueType: Transform.TSTypeAnnotation(node.trueType),
        falseType: Transform.TSTypeAnnotation(node.falseType)
      });
    }

    static TSConstructorType(node) {
      return unsupportedAnnotation(node, 'constructor types');
    }

    static TSDeclareFunction(node) {
      var _node$returnType2;

      if (node.id == null) {
        throw translationError(node, 'Missing function name');
      }

      const name = node.id.name;

      const {
        thisParam,
        restParam,
        params
      } = Transform._partitionAndTranslateTSFunctionParams(node.params);

      const fnAnnot = constructFlowNode({
        type: 'FunctionTypeAnnotation',
        typeParameters: Transform.TSTypeParameterDeclarationOpt(node.typeParameters),
        params,
        rest: restParam,
        returnType: ((_node$returnType2 = node.returnType) == null ? void 0 : _node$returnType2.typeAnnotation) == null ? unsupportedAnnotation(node, 'missing return type') : Transform.TSTypeAnnotation(node.returnType.typeAnnotation),
        this: thisParam
      });
      return constructFlowNode({
        type: 'DeclareFunction',
        id: { ...DUMMY_COMMON,
          type: 'Identifier',
          name,
          typeAnnotation: { ...DUMMY_COMMON,
            type: 'TypeAnnotation',
            typeAnnotation: fnAnnot
          },
          optional: false
        },
        predicate: null
      });
    }

    static TSEnumDeclaration(node) {
      return unsupportedDeclaration(node, 'enums', node.id);
    }

    static TSExportAssignment(node) {
      let typeAnnotation;

      if (node.expression.type === 'Identifier') {
        typeAnnotation = constructFlowNode({
          type: 'TypeofTypeAnnotation',
          argument: Transform.Identifier(node.expression)
        });
      } else if (node.expression.type === 'Literal') {
        typeAnnotation = Transform.LiteralType(node.expression);
      } else {
        throw translationError(node, `Unsupported export assignment expression ${node.expression.type}`);
      }

      return constructFlowNode({
        type: 'DeclareModuleExports',
        typeAnnotation: constructFlowNode({
          type: 'TypeAnnotation',
          typeAnnotation
        })
      });
    }

    static TSFunctionType(node, allowMissingReturn = false) {
      var _node$returnType3;

      const {
        thisParam,
        restParam,
        params
      } = Transform._partitionAndTranslateTSFunctionParams(node.params);

      return constructFlowNode({
        type: 'FunctionTypeAnnotation',
        typeParameters: Transform.TSTypeParameterDeclarationOpt(node.typeParameters),
        params: params,
        rest: restParam,
        returnType: ((_node$returnType3 = node.returnType) == null ? void 0 : _node$returnType3.typeAnnotation) == null ? allowMissingReturn ? constructFlowNode({
          type: 'VoidTypeAnnotation'
        }) : unsupportedAnnotation(node, 'missing return type') : Transform.TSTypeAnnotation(node.returnType.typeAnnotation),
        this: thisParam
      });
    }

    static _partitionAndTranslateTSFunctionParams(tsParams) {
      const params = [...tsParams];
      const firstParam = params[0];
      let thisParam = null;
      let restParam = null;

      if (firstParam != null && firstParam.type === 'Identifier' && firstParam.name === 'this') {
        var _firstParam$typeAnnot;

        thisParam = constructFlowNode({
          type: 'FunctionTypeParam',
          name: constructFlowNode({
            type: 'Identifier',
            name: 'this',
            optional: false,
            typeAnnotation: null
          }),
          optional: false,
          typeAnnotation: Transform.TSTypeAnnotationOpt((_firstParam$typeAnnot = firstParam.typeAnnotation) == null ? void 0 : _firstParam$typeAnnot.typeAnnotation)
        });
        params.shift();
      }

      const lastParam = params[params.length - 1];

      if (lastParam != null && lastParam.type === 'RestElement') {
        var _lastParam$typeAnnota;

        restParam = constructFlowNode({
          type: 'FunctionTypeParam',
          name: constructFlowNode({
            type: 'Identifier',
            name: '$$rest$$',
            optional: false,
            typeAnnotation: null
          }),
          optional: false,
          typeAnnotation: Transform.TSTypeAnnotationOpt((_lastParam$typeAnnota = lastParam.typeAnnotation) == null ? void 0 : _lastParam$typeAnnota.typeAnnotation)
        });
        params.pop();
      }

      return {
        thisParam,
        restParam,
        params: params.map((param, i) => {
          if (param.type === 'Identifier') {
            var _param$typeAnnotation;

            return constructFlowNode({
              type: 'FunctionTypeParam',
              name: constructFlowNode({
                type: 'Identifier',
                name: param.name,
                optional: false,
                typeAnnotation: null
              }),
              optional: Boolean(param.optional),
              typeAnnotation: Transform.TSTypeAnnotationOpt((_param$typeAnnotation = param.typeAnnotation) == null ? void 0 : _param$typeAnnotation.typeAnnotation)
            });
          } else if (param.type === 'ArrayPattern' || param.type === 'ObjectPattern') {
            var _param$typeAnnotation2;

            return constructFlowNode({
              type: 'FunctionTypeParam',
              name: constructFlowNode({
                type: 'Identifier',
                name: `$$param${i}$`,
                optional: false,
                typeAnnotation: null
              }),
              optional: Boolean(param.optional),
              typeAnnotation: Transform.TSTypeAnnotationOpt((_param$typeAnnotation2 = param.typeAnnotation) == null ? void 0 : _param$typeAnnotation2.typeAnnotation)
            });
          } else {
            throw new Error(`Unexpected function parameter ${param.type}`);
          }
        })
      };
    }

    static TSImportType(node) {
      let base = constructFlowNode({
        type: 'GenericTypeAnnotation',
        id: constructFlowNode({
          type: 'Identifier',
          name: '$Exports',
          optional: false,
          typeAnnotation: null
        }),
        typeParameters: constructFlowNode({
          type: 'TypeParameterInstantiation',
          params: [Transform.TSTypeAnnotation(node.argument)]
        })
      });

      if (node.qualifier == null) {
        return base;
      }

      if (node.typeParameters != null) {
        return unsupportedAnnotation(node, 'import types with type parameters');
      }

      let qualifier = Transform.EntityNameToTypeIdentifier(node.qualifier);
      const namesRev = [];

      while (qualifier.type !== 'Identifier') {
        namesRev.push(qualifier.id.name);
        qualifier = qualifier.qualification;
      }

      namesRev.push(qualifier.name);

      while (namesRev.length > 0) {
        const name = namesRev.pop();
        base = constructFlowNode({
          type: 'IndexedAccessType',
          objectType: base,
          indexType: constructFlowNode({
            type: 'StringLiteralTypeAnnotation',
            value: name,
            raw: `'${name}'`
          })
        });
      }

      return base;
    }

    static TSImportEqualsDeclaration(node) {
      if (node.moduleReference.type === 'ThisExpression' || node.moduleReference.type === 'TSQualifiedName') {
        return unsupportedDeclaration(node, 'import equals declaration with weird module reference', node.id);
      }

      let moduleName;

      if (node.moduleReference.type === 'TSExternalModuleReference') {
        if (node.moduleReference.expression.type === 'Literal') {
          moduleName = String(node.moduleReference.expression.value);
        } else {
          return unsupportedDeclaration(node, 'import equals declaration with weird module reference', node.id);
        }
      } else {
        moduleName = node.moduleReference.name;
      }

      return constructFlowNode({
        type: 'VariableDeclaration',
        kind: 'const',
        declarations: [constructFlowNode({
          type: 'VariableDeclarator',
          id: constructFlowNode({
            type: 'Identifier',
            name: node.id.name,
            optional: false,
            typeAnnotation: null
          }),
          init: constructFlowNode({
            type: 'CallExpression',
            callee: constructFlowNode({
              type: 'Identifier',
              name: 'require',
              optional: false,
              typeAnnotation: null
            }),
            arguments: [constructFlowNode({
              type: 'Literal',
              literalType: 'string',
              value: moduleName,
              raw: `"${moduleName}"`
            })],
            optional: false,
            typeArguments: null
          })
        })]
      });
    }

    static TSIndexedAccessType(node) {
      return constructFlowNode({
        type: 'IndexedAccessType',
        objectType: Transform.TSTypeAnnotation(node.objectType),
        indexType: Transform.TSTypeAnnotation(node.indexType)
      });
    }

    static TSInferType(node) {
      return constructFlowNode({
        type: 'InferTypeAnnotation',
        typeParameter: Transform.TSTypeParameter(node.typeParameter)
      });
    }

    static TSInterfaceDeclaration(node) {
      const body = Transform.TSTypeLiteralOrInterfaceBody(node.body); // $FlowFixMe[cannot-write]

      body.inexact = false;
      return constructFlowNode({
        type: 'InterfaceDeclaration',
        id: Transform.Identifier(node.id),
        typeParameters: Transform.TSTypeParameterDeclarationOpt(node.typeParameters),
        body,
        extends: (node.extends || []).map(e => Transform.TSInterfaceHeritage(e))
      });
    }

    static TSInterfaceHeritage(node) {
      return constructFlowNode({
        type: 'InterfaceExtends',
        id: Transform._expressionToIdOrQualifiedTypeId(node.expression, 'interface extends'),
        typeParameters: Transform.TSTypeParameterInstantiationOpt(node.typeParameters)
      });
    }

    static _expressionToIdOrQualifiedTypeId(node, kind) {
      if (node.type === 'Identifier') {
        return Transform.Identifier(node);
      } else if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
        const id = Transform.Identifier(node.property);
        return constructFlowNode({
          type: 'QualifiedTypeIdentifier',
          qualification: Transform._expressionToIdOrQualifiedTypeId(node.object, kind),
          id
        });
      } else {
        throw unexpectedTranslationError(node, `Expected ${kind} to be an Identifier or Member`);
      }
    }

    static TSIntersectionType(node) {
      return constructFlowNode({
        type: 'IntersectionTypeAnnotation',
        types: node.types.map(node => Transform.TSTypeAnnotation(node))
      });
    }

    static TSLiteralType(node) {
      switch (node.literal.type) {
        case 'TemplateLiteral':
          return unsupportedAnnotation(node, 'template literals');

        case 'Literal':
          return Transform.LiteralType(node.literal);

        case 'UnaryExpression':
          return unsupportedAnnotation(node, 'UnaryExpression literal type');

        case 'UpdateExpression':
          return unsupportedAnnotation(node, 'UpdateExpression literal type');
      }
    }

    static TSMappedType(node) {
      var _keyTparam$bound;

      const keyTparam = Transform.TSTypeParameter(node.typeParameter);
      const sourceType = (_keyTparam$bound = keyTparam.bound) == null ? void 0 : _keyTparam$bound.typeAnnotation; // $FlowFixMe[cannot-write]

      keyTparam.bound = null;
      const prop = constructFlowNode({
        type: 'ObjectTypeMappedTypeProperty',
        keyTparam,
        propType: Transform.TSTypeAnnotationOpt(node.typeAnnotation),
        sourceType,
        variance: node.readonly === '+' || Boolean(node.readonly) ? constructFlowNode({
          type: 'Variance',
          kind: 'plus'
        }) : null,
        optional: node.optional === '+' ? 'PlusOptional' : node.optional === '-' ? 'MinusOptional' : // eslint-disable-next-line no-extra-boolean-cast
        Boolean(node.optional) ? 'Optional' : null
      });
      return constructFlowNode({
        type: 'ObjectTypeAnnotation',
        properties: [prop],
        indexers: [],
        callProperties: [],
        internalSlots: [],
        exact: false,
        inexact: false
      });
    }

    static TSModuleDeclaration(node) {
      var _node$global;

      const savedInDeclareModule = Transform.inDeclareModule;
      Transform.inDeclareModule = true;
      const body = node.body == null ? constructFlowNode({
        type: 'BlockStatement',
        body: []
      }) : node.body.type === 'TSModuleDeclaration' ? (() => {
        throw translationError(node, 'nested module declarations');
      })() : constructFlowNode({
        type: 'BlockStatement',
        body: node.body.body.flatMap(s => Transform.Statement(s))
      });
      Transform.inDeclareModule = savedInDeclareModule;

      if (node.id.type === 'Literal') {
        return constructFlowNode({
          type: 'DeclareModule',
          id: Transform.Literal(node.id),
          body
        });
      }

      if ((_node$global = node.global) != null ? _node$global : false) {
        return unsupportedDeclaration(node, 'global declaration', node.id);
      }

      return constructFlowNode({
        type: 'DeclareNamespace',
        id: Transform.Identifier(node.id),
        body
      });
    }

    static TSNamedTupleMember(node) {
      let optional = false;
      let elementType;

      if (node.elementType.type === 'TSRestType') {
        const child = node.elementType;
        return constructFlowNode({
          type: 'TupleTypeSpreadElement',
          label: Transform.Identifier(node.label),
          typeAnnotation: Transform.TSTypeAnnotation(child.typeAnnotation),
          optional: false,
          variance: null
        });
      } else if (node.elementType.type === 'TSOptionalType') {
        optional = true;
        elementType = Transform.TSTypeAnnotation(node.elementType.typeAnnotation);
      } else {
        elementType = Transform.TSTypeAnnotation(node.elementType);
      }

      return constructFlowNode({
        type: 'TupleTypeLabeledElement',
        label: Transform.Identifier(node.label),
        elementType,
        optional,
        variance: null
      });
    }

    static TSNeverType() {
      return constructFlowNode({
        type: 'EmptyTypeAnnotation'
      });
    }

    static TSNullType() {
      return constructFlowNode({
        type: 'NullLiteralTypeAnnotation'
      });
    }

    static TSNumberType() {
      return constructFlowNode({
        type: 'NumberTypeAnnotation'
      });
    }

    static TSObjectType() {
      return constructFlowNode({
        type: 'InterfaceTypeAnnotation',
        body: constructFlowNode({
          type: 'ObjectTypeAnnotation',
          inexact: false,
          exact: false,
          properties: [],
          indexers: [],
          callProperties: [],
          internalSlots: []
        }),
        extends: []
      });
    }

    static TSQualifiedNameToQualifiedTypeIdentifier(node) {
      return constructFlowNode({
        type: 'QualifiedTypeIdentifier',
        qualification: Transform.EntityNameToTypeIdentifier(node.left),
        id: Transform.Identifier(node.right)
      });
    }

    static TSQualifiedNameToQualifiedTypeofIdentifier(node) {
      return constructFlowNode({
        type: 'QualifiedTypeofIdentifier',
        qualification: Transform.EntityNameToTypeofIdentifier(node.left),
        id: Transform.Identifier(node.right)
      });
    }

    static TSStringType() {
      return constructFlowNode({
        type: 'StringTypeAnnotation'
      });
    }

    static TSSymbolType() {
      return constructFlowNode({
        type: 'SymbolTypeAnnotation'
      });
    }

    static TSTemplateLiteralType(node) {
      return unsupportedAnnotation(node, 'constructor types');
    }

    static TSThisType(_node) {
      return constructFlowNode({
        type: 'GenericTypeAnnotation',
        id: constructFlowNode({
          type: 'Identifier',
          name: 'this',
          typeAnnotation: null,
          optional: false
        }),
        typeParameters: null
      });
    }

    static TSTupleType(node) {
      return constructFlowNode({
        type: 'TupleTypeAnnotation',
        types: node.elementTypes.map(node => Transform.TSTypeAnnotation(node))
      });
    }

    static TSTypeAliasDeclaration(node) {
      return constructFlowNode({
        type: 'TypeAlias',
        id: Transform.Identifier(node.id),
        typeParameters: Transform.TSTypeParameterDeclarationOpt(node.typeParameters),
        right: Transform.TSTypeAnnotation(node.typeAnnotation)
      });
    }

    static TSTypeAnnotation(node) {
      switch (node.type) {
        case 'TSOptionalType':
        case 'TSQualifiedName':
        case 'TSRestType':
          return unsupportedAnnotation(node, 'unexpected toplevel ' + node.type);

        case 'TSAbstractKeyword':
        case 'TSAsyncKeyword':
        case 'TSDeclareKeyword':
        case 'TSExportKeyword':
        case 'TSPrivateKeyword':
        case 'TSProtectedKeyword':
        case 'TSPublicKeyword':
        case 'TSReadonlyKeyword':
        case 'TSStaticKeyword':
          return unsupportedAnnotation(node, 'wat keyword ' + node.type);

        case 'TSAnyKeyword':
          return Transform.TSAnyType();

        case 'TSArrayType':
          return Transform.TSArrayType(node);

        case 'TSBigIntKeyword':
          return Transform.TSBigIntType();

        case 'TSBooleanKeyword':
          return Transform.TSBooleanType();

        case 'TSConditionalType':
          return Transform.TSConditionalType(node);

        case 'TSConstructorType':
          return Transform.TSConstructorType(node);

        case 'TSFunctionType':
          return Transform.TSFunctionType(node);

        case 'TSImportType':
          return Transform.TSImportType(node);

        case 'TSIndexedAccessType':
          return Transform.TSIndexedAccessType(node);

        case 'TSInferType':
          return Transform.TSInferType(node);

        case 'TSIntersectionType':
          return Transform.TSIntersectionType(node);

        case 'TSIntrinsicKeyword':
          return unsupportedAnnotation(node, 'intrinsic keyword');

        case 'TSLiteralType':
          return Transform.TSLiteralType(node);

        case 'TSMappedType':
          return Transform.TSMappedType(node);

        case 'TSNamedTupleMember':
          return Transform.TSNamedTupleMember(node);

        case 'TSNeverKeyword':
          return Transform.TSNeverType();

        case 'TSNullKeyword':
          return Transform.TSNullType();

        case 'TSNumberKeyword':
          return Transform.TSNumberType();

        case 'TSObjectKeyword':
          return Transform.TSObjectType();

        case 'TSStringKeyword':
          return Transform.TSStringType();

        case 'TSSymbolKeyword':
          return Transform.TSSymbolType();

        case 'TSTemplateLiteralType':
          return Transform.TSTemplateLiteralType(node);

        case 'TSThisType':
          return Transform.TSThisType(node);

        case 'TSTupleType':
          return Transform.TSTupleType(node);

        case 'TSTypeLiteral':
          return Transform.TSTypeLiteralOrInterfaceBody(node);

        case 'TSTypeOperator':
          return Transform.TSTypeOperator(node);

        case 'TSTypePredicate':
          return Transform.TSTypePredicate(node);

        case 'TSTypeQuery':
          return Transform.TSTypeQuery(node);

        case 'TSTypeReference':
          return Transform.TSTypeReference(node);

        case 'TSUndefinedKeyword':
        case 'TSVoidKeyword':
          return Transform.TSUndefinedOrVoidType();

        case 'TSUnionType':
          return Transform.TSUnionType(node);

        case 'TSUnknownKeyword':
          return Transform.TSUnknownType();
      }
    }

    static TSTypeAnnotationOpt(node) {
      return node == null ? constructFlowNode({
        type: 'AnyTypeAnnotation'
      }) : Transform.TSTypeAnnotation(node);
    }

    static TSTypeAnnotationNode(node) {
      return constructFlowNode({
        type: 'TypeAnnotation',
        typeAnnotation: Transform.TSTypeAnnotation(node.typeAnnotation)
      });
    }
    /** A very confusingly named object type */


    static TSTypeLiteralOrInterfaceBody(node) {
      const properties = [];
      const indexers = [];
      const callProperties = [];

      for (const prop of node.type === 'TSTypeLiteral' ? node.members : node.body) {
        switch (prop.type) {
          case 'TSPropertySignature':
            {
              Transform._translateIntoObjectProp(prop, properties, indexers);

              break;
            }

          case 'TSMethodSignature':
            {
              Transform._translateIntoObjectMethod(prop, properties);

              break;
            }

          case 'TSCallSignatureDeclaration':
            callProperties.push(constructFlowNode({
              type: 'ObjectTypeCallProperty',
              method: false,
              optional: false,
              static: false,
              proto: false,
              variance: null,
              value: Transform.TSFunctionType({
                type: 'TSFunctionType',
                loc: prop.loc,
                params: prop.params,
                returnType: prop.returnType,
                typeParameters: prop.typeParameters
              })
            }));
            break;

          case 'TSIndexSignature':
            {
              var _prop$typeAnnotation;

              // eslint-disable-next-line no-extra-boolean-cast
              const variance = Boolean(prop.readonly) ? constructFlowNode({
                type: 'Variance',
                kind: 'plus'
              }) : null;
              indexers.push(constructFlowNode({
                type: 'ObjectTypeIndexer',
                kind: 'init',
                method: false,
                optional: false,
                static: Boolean(prop.static),
                proto: false,
                variance,
                id: null,
                key: constructFlowNode({
                  type: 'StringTypeAnnotation'
                }),
                value: Transform.TSTypeAnnotationOpt((_prop$typeAnnotation = prop.typeAnnotation) == null ? void 0 : _prop$typeAnnotation.typeAnnotation)
              }));
              break;
            }

          case 'TSConstructSignatureDeclaration':
            properties.push(constructFlowNode({
              type: 'ObjectTypeProperty',
              kind: 'init',
              method: true,
              optional: false,
              static: false,
              proto: false,
              variance: null,
              key: constructFlowNode({
                type: 'Identifier',
                name: 'constructor',
                optional: false,
                typeAnnotation: null
              }),
              value: Transform.TSFunctionType({
                type: 'TSFunctionType',
                loc: prop.loc,
                params: prop.params,
                returnType: prop.returnType,
                typeParameters: prop.typeParameters
              }, true)
            }));
            break;
        }
      }

      return constructFlowNode({
        type: 'ObjectTypeAnnotation',
        properties,
        indexers,
        callProperties,
        internalSlots: [],
        exact: false,
        inexact: true
      });
    }

    static _translateIntoObjectProp(prop, properties, indexers) {
      // eslint-disable-next-line no-extra-boolean-cast
      const variance = Boolean(prop.readonly) ? constructFlowNode({
        type: 'Variance',
        kind: 'plus'
      }) : null;

      if (prop.computed === false) {
        var _prop$typeAnnotation2;

        const key = prop.key;
        properties.push(constructFlowNode({
          type: 'ObjectTypeProperty',
          kind: 'init',
          method: false,
          optional: Boolean(prop.optional),
          static: false,
          proto: false,
          variance,
          key: key.type === 'Identifier' ? Transform.Identifier(key, false) : key.type === 'PrivateIdentifier' ? constructFlowNode({
            type: 'PrivateIdentifier',
            name: key.name
          }) : constructFlowNode({
            type: 'Literal',
            literalType: 'string',
            value: String(key.value),
            raw: JSON.stringify(String(key.value))
          }),
          value: Transform.TSTypeAnnotationOpt((_prop$typeAnnotation2 = prop.typeAnnotation) == null ? void 0 : _prop$typeAnnotation2.typeAnnotation)
        }));
      } else {
        var _prop$typeAnnotation3;

        indexers.push(constructFlowNode({
          type: 'ObjectTypeIndexer',
          kind: 'init',
          method: false,
          optional: Boolean(prop.optional),
          static: false,
          proto: false,
          variance,
          id: null,
          key: constructFlowNode({
            type: 'StringTypeAnnotation'
          }),
          value: Transform.TSTypeAnnotationOpt((_prop$typeAnnotation3 = prop.typeAnnotation) == null ? void 0 : _prop$typeAnnotation3.typeAnnotation)
        }));
      }
    }

    static _translateIntoObjectMethod(prop, properties) {
      if (prop.computed === true) {
        throw translationError(prop, 'computed method signature');
      }

      const originalKey = prop.key;
      const key = originalKey.type === 'Identifier' ? Transform.Identifier(originalKey, false) : originalKey.type === 'PrivateIdentifier' ? constructFlowNode({
        type: 'PrivateIdentifier',
        name: originalKey.name
      }) : constructFlowNode({
        type: 'Literal',
        literalType: 'string',
        value: String(originalKey.value),
        raw: JSON.stringify(String(originalKey.value))
      });
      const value = Transform.TSFunctionType({
        type: 'TSFunctionType',
        loc: prop.loc,
        params: prop.type === 'MethodDefinition' || prop.type === 'TSAbstractMethodDefinition' ? prop.value.params : prop.params,
        returnType: prop.type === 'MethodDefinition' || prop.type === 'TSAbstractMethodDefinition' ? prop.value.returnType : prop.returnType,
        typeParameters: prop.typeParameters
      }, true);

      if (prop.kind === 'method' || prop.kind === 'constructor') {
        properties.push(constructFlowNode({
          type: 'ObjectTypeProperty',
          kind: 'init',
          method: true,
          optional: false,
          static: false,
          proto: false,
          variance: null,
          key,
          value
        }));
      } else {
        properties.push(constructFlowNode({
          type: 'ObjectTypeProperty',
          kind: prop.kind,
          method: false,
          optional: false,
          static: false,
          proto: false,
          variance: null,
          key,
          value
        }));
      }
    }

    static TSTypeOperator(node) {
      switch (node.operator) {
        case 'unique':
          return unsupportedAnnotation(node, 'unique operator');

        case 'keyof':
          return constructFlowNode({
            type: 'KeyofTypeAnnotation',
            argument: Transform.TSTypeAnnotationOpt(node.typeAnnotation)
          });

        case 'readonly':
          {
            const child = node.typeAnnotation;

            switch (child == null ? void 0 : child.type) {
              case 'TSArrayType':
                return constructFlowNode({
                  type: 'GenericTypeAnnotation',
                  id: constructFlowNode({
                    type: 'Identifier',
                    name: '$ReadOnlyArray',
                    optional: false,
                    typeAnnotation: null
                  }),
                  typeParameters: constructFlowNode({
                    type: 'TypeParameterInstantiation',
                    params: [Transform.TSTypeAnnotation(child.elementType)]
                  })
                });

              case 'TSTupleType':
                return constructFlowNode({
                  type: 'GenericTypeAnnotation',
                  id: constructFlowNode({
                    type: 'Identifier',
                    name: '$ReadOnly',
                    optional: false,
                    typeAnnotation: null
                  }),
                  typeParameters: constructFlowNode({
                    type: 'TypeParameterInstantiation',
                    params: [Transform.TSTypeAnnotation(child)]
                  })
                });

              default:
                return unsupportedAnnotation(node, 'readonly operator with inner type: ' + ((child == null ? void 0 : child.type) || 'null'));
            }
          }
      }
    }

    static TSTypeParameter(node) {
      return constructFlowNode({
        type: 'TypeParameter',
        name: node.name.name,
        bound: node.constraint == null ? null : constructFlowNode({
          type: 'TypeAnnotation',
          typeAnnotation: Transform.TSTypeAnnotation(node.constraint)
        }),
        default: node.default == null ? null : Transform.TSTypeAnnotation(node.default),
        usesExtendsBound: false,
        variance: node.in && node.out || !node.in && !node.out ? null : constructFlowNode({
          type: 'Variance',
          kind: node.out ? 'plus' : 'minus'
        })
      });
    }

    static TSTypeParameterDeclaration(node) {
      return constructFlowNode({
        type: 'TypeParameterDeclaration',
        params: node.params.map(node => Transform.TSTypeParameter(node))
      });
    }

    static TSTypeParameterDeclarationOpt(node) {
      return node != null ? Transform.TSTypeParameterDeclaration(node) : null;
    }

    static TSTypeParameterInstantiation(node) {
      return constructFlowNode({
        type: 'TypeParameterInstantiation',
        params: node.params.map(node => Transform.TSTypeAnnotation(node))
      });
    }

    static TSTypeParameterInstantiationOpt(node) {
      return node != null ? Transform.TSTypeParameterInstantiation(node) : null;
    }

    static TSTypePredicate(node) {
      return constructFlowNode({
        type: 'TypePredicate',
        parameterName: node.parameterName.type === 'TSThisType' ? constructFlowNode({
          type: 'Identifier',
          name: 'this',
          optional: false,
          typeAnnotation: null
        }) : Transform.Identifier(node.parameterName, false),
        asserts: node.asserts,
        typeAnnotation: node.typeAnnotation == null ? null : Transform.TSTypeAnnotation(node.typeAnnotation.typeAnnotation)
      });
    }

    static TSTypeQuery(node) {
      var _Transform$TSTypePara;

      return constructFlowNode({
        type: 'TypeofTypeAnnotation',
        argument: Transform.EntityNameToTypeofIdentifier(node.exprName),
        typeArguments: (_Transform$TSTypePara = Transform.TSTypeParameterInstantiationOpt(node.typeParameters)) != null ? _Transform$TSTypePara : undefined
      });
    }

    static TSTypeReference(node) {
      return constructFlowNode({
        type: 'GenericTypeAnnotation',
        id: Transform.EntityNameToTypeIdentifier(node.typeName),
        typeParameters: Transform.TSTypeParameterInstantiationOpt(node.typeParameters)
      });
    }

    static TSUndefinedOrVoidType() {
      return constructFlowNode({
        type: 'VoidTypeAnnotation'
      });
    }

    static TSUnionType(node) {
      return constructFlowNode({
        type: 'UnionTypeAnnotation',
        types: node.types.map(node => Transform.TSTypeAnnotation(node))
      });
    }

    static TSUnknownType() {
      return constructFlowNode({
        type: 'MixedTypeAnnotation'
      });
    }

    static VariableDeclaration(node) {
      return node.declarations.map(decl => {
        if (decl.id.type !== 'Identifier') {
          throw translationError(decl.id, 'Non-identifier variable declaration');
        }

        const id = Transform.Identifier(decl.id);

        if (id.typeAnnotation == null) {
          // $FlowExpectedError[cannot-write]
          id.typeAnnotation = constructFlowNode({
            type: 'TypeAnnotation',
            typeAnnotation: constructFlowNode({
              type: 'AnyTypeAnnotation'
            })
          });
        }

        return constructFlowNode({
          type: 'DeclareVariable',
          id,
          kind: node.kind
        });
      });
    }

  }

  Transform.inDeclareModule = false;
  return [Transform, code];
};
