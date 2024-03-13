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
exports.removeAtFlowFromDocblock = removeAtFlowFromDocblock;
const FLOW_DIRECTIVE = /(@flow(\s+(strict(-local)?|weak))?|@noflow)/;

function removeAtFlowFromDocblock(docblock) {
  if (!FLOW_DIRECTIVE.test(docblock.comment.value)) {
    return docblock;
  }

  return {
    // $FlowExpectedError[cannot-spread-interface]
    comment: { ...docblock.comment,
      value: docblock.comment.value.replace(FLOW_DIRECTIVE, '')
    },
    directives: { ...docblock.directives,
      flow: undefined,
      noflow: undefined
    }
  };
}