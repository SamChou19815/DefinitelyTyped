/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 * @format
 */

/**
 * The following types have been adapted by hand from
 * https://unpkg.com/browse/@typescript-eslint/types@5.41.0/dist/generated/ast-spec.d.ts
 *
 * Changes:
 * - remove and inline `ValueOf` type
 * - `undefined` -> `void`
 * - remove all `declare` keywords
 * - comment out `bigint` type
 *     -> flow doesn't support it yet
 * - remove `range` and `loc` from `NodeOrTokenData`
 *     -> during conversion our locations will be all off, so we'll rely on prettier to print later
 * - make all properties readonly and all arrays $ReadOnlyArray
 *     -> unlike TS - flow enforces subtype constraints strictly!
 * - add `type` to interfaces that previously relied upon inheriting the `type`
 *     -> this is because flow sentinel refinement does not check inherited members
 * - create "Ambiguous" versions for some nodes that have unions (like PropertyDefinition, MemberDefinition)
 *     -> makes it easier to construct them from other nodes that have unions
 */
'use strict';