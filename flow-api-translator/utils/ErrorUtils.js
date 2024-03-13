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
exports.UnexpectedTranslationError = exports.ExpectedTranslationError = void 0;
exports.buildCodeFrame = buildCodeFrame;
exports.flowFixMeOrError = flowFixMeOrError;
exports.translationError = translationError;
exports.unexpectedTranslationError = unexpectedTranslationError;

var _hermesTransform = require("hermes-transform");

var _codeFrame = require("@babel/code-frame");

function flowFixMeOrError(container, message, context) {
  if (context.recoverFromErrors) {
    return _hermesTransform.t.GenericTypeAnnotation({
      id: _hermesTransform.t.Identifier({
        name: '$FlowFixMe'
      })
    });
  }

  throw translationError(container, message, context);
}

class TranslationErrorBase extends Error {
  constructor(node, message, context) {
    const framedMessage = buildCodeFrame(node, message, context.code);
    super( // jest error snapshots will use a hard-coded string representation if
    // `instanceof Error` which makes the code frame look awful and hard to verify:
    //
    // [TranslationError: > 12 | code
    //       | ^^^^ error]
    //
    // this just adds a newline in jest tests so that it all lines up nicely
    //
    // [TranslationError:
    // > 12 | code
    //      | ^^^^ error]
    process.env.JEST_WORKER_ID == null ? framedMessage : `\n${framedMessage}`);
    this.name = 'TranslationError';
  }

}

class ExpectedTranslationError extends TranslationErrorBase {
  constructor(...args) {
    super(...args);
    this.name = 'ExpectedTranslationError';
  }

}

exports.ExpectedTranslationError = ExpectedTranslationError;

function translationError(node, message, context) {
  return new ExpectedTranslationError(node, message, context);
}

class UnexpectedTranslationError extends TranslationErrorBase {
  constructor(...args) {
    super(...args);
    this.name = 'UnexpectedTranslationError';
  }

}

exports.UnexpectedTranslationError = UnexpectedTranslationError;

function unexpectedTranslationError(node, message, context) {
  return new UnexpectedTranslationError(node, message, context);
}

function buildCodeFrame(node, message, code, highlightCode = process.env.NODE_ENV !== 'test') {
  // babel uses 1-indexed columns
  const locForBabel = {
    start: {
      line: node.loc.start.line,
      column: node.loc.start.column + 1
    },
    end: {
      line: node.loc.end.line,
      column: node.loc.end.column + 1
    }
  };
  return (0, _codeFrame.codeFrameColumns)(code, locForBabel, {
    linesAbove: 0,
    linesBelow: 0,
    highlightCode,
    message: message
  });
}