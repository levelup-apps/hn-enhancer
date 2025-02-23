import {describe, expect, it} from '@jest/globals';

import {enrichPostComments, getDownvoteCount} from './download.js';

describe('enrichPostComments function', () => {
    it('should enrich the comments correctly', () => {
        const post = {
            id: 101,
            type: 'story',
            children: [
                {
                    id: 102,
                    type: 'comment',
                    author: 'user1',
                    children: [
                        {
                            id: 103,
                            type: 'comment',
                            author: 'user2',
                            children: []
                        }
                    ]
                },
                {
                    id: 104,
                    type: 'comment',
                    author: 'user3',
                    children: []
                }
            ]
        };

        const commentsInDOM = new Map([
            [102, { position: 0, text: 'Comment 1', downvotes: 1 }],
            [103, { position: 1, text: 'Comment 2', downvotes: 0 }],
            [104, { position: 2, text: 'Comment 3', downvotes: 2 }]
        ]);

        const enrichedComments = enrichPostComments(post, commentsInDOM);

        // Test that the story (id = 101) does not exist
        expect(enrichedComments.has(101)).toBe(false);

        expect(enrichedComments.size).toBe(3);
        expect(enrichedComments.not)

        expect(enrichedComments.get(102)).toEqual({
            id: 102,
            author: 'user1',
            replies: 1,
            position: 0,
            text: 'Comment 1',
            downvotes: 1,
            parentId: 101,
            path: '1',
            score: 900
        });

        expect(enrichedComments.get(103)).toEqual({
            id: 103,
            author: 'user2',
            replies: 0,
            position: 1,
            text: 'Comment 2',
            downvotes: 0,
            parentId: 102,
            path: '1.1',
            score: 666
        });

        expect(enrichedComments.get(104)).toEqual({
            id: 104,
            author: 'user3',
            replies: 0,
            position: 2,
            text: 'Comment 3',
            downvotes: 2,
            parentId: 101,
            path: '2',
            score: 266
        });
    });
});

describe('enrichPostComments function', () => {
    it('should calculate score using downvotes correctly', () => {
        const post = {
            id: 201,
            type: 'story',
            children: [
                {
                    id: 202,
                    type: 'comment',
                    author: 'user1',
                    children: [
                        {
                            id: 203,
                            type: 'comment',
                            author: 'user2',
                            children: []
                        }
                    ]
                },
                {
                    id: 204,
                    type: 'comment',
                    author: 'user3',
                    children: []
                },
                {
                    id: 205,
                    type: 'comment',
                    author: 'user1',
                    children: []
                }
            ]
        };

        const commentsInDOM = new Map([
            [202, { position: 0, text: 'Comment 1', downvotes: 1 }],
            [203, { position: 1, text: 'Comment 2', downvotes: 10 }],
            [204, { position: 2, text: 'Comment 3', downvotes: 0 }],
            [205, { position: 3, text: 'Comment 4', downvotes: 1 }],
        ]);

        const enrichedComments = enrichPostComments(post, commentsInDOM);

        expect(enrichedComments.size).toBe(4);

        // Test that the story (id = 101) does not exist
        expect(enrichedComments.has(201)).toBe(false);

        expect(enrichedComments.get(202)).toEqual({
            id: 202,
            author: 'user1',
            replies: 1,
            position: 0,
            text: 'Comment 1',
            downvotes: 1,
            parentId: 201,
            path: '1',
            score: 900
        });

        expect(enrichedComments.get(203)).toEqual({
            id: 203,
            author: 'user2',
            replies: 0,
            position: 1,
            text: 'Comment 2',
            downvotes: 10,
            parentId: 202,
            path: '1.1',
            score: 0
        });

        expect(enrichedComments.get(204)).toEqual({
            id: 204,
            author: 'user3',
            replies: 0,
            position: 2,
            text: 'Comment 3',
            downvotes: 0,
            parentId: 201,
            path: '2',
            score: 500
        });

        expect(enrichedComments.get(205)).toEqual({
            id: 205,
            author: 'user1',
            replies: 0,
            position: 3,
            text: 'Comment 4',
            downvotes: 1,
            parentId: 201,
            path: '3',
            score: 225
        });
    });
});

describe('getDownvoteCount', () => {
// Helper function to create a mock div with classList
    const createMockDiv = (classes) => ({
        classList: classes
    });

    it('should return correct downvote count for valid class names', () => {
        const testCases = [
            { classes: ['commText', 'c00'], expected: 0 },
            { classes: ['commText', 'c5a'], expected: 1 },
            { classes: ['commText', 'c73'], expected: 2 },
            { classes: ['commText', 'c82'], expected: 3 },
            { classes: ['commText', 'c88'], expected: 4 },
            { classes: ['commText', 'c9c'], expected: 5 },
            { classes: ['commText', 'cae'], expected: 6 },
            { classes: ['commText', 'cbe'], expected: 7 },
            { classes: ['commText', 'cce'], expected: 8 },
            { classes: ['commText', 'cdd'], expected: 9 },
            { classes: ['c00'], expected: 0 },
            { classes: ['c5a'], expected: 1 },
            { classes: ['c73'], expected: 2 },
            { classes: ['c82'], expected: 3 },
            { classes: ['c88'], expected: 4 },
            { classes: ['c9c'], expected: 5 },
            { classes: ['cae'], expected: 6 },
            { classes: ['cbe'], expected: 7 },
            { classes: ['cce'], expected: 8 },
            { classes: ['cdd'], expected: 9 }
        ];

        testCases.forEach(({ classes, expected }) => {
            const mockDiv = createMockDiv(classes);
            const downvoteCount = getDownvoteCount(mockDiv);
            expect(downvoteCount).toBe(expected);
        });
    });

    it('should handle uppercase class names correctly', () => {
        const testCases = [
            { classes: ['commText', 'C00'], expected: 0 },
            { classes: ['commText', 'C5A'], expected: 1 },
            { classes: ['commText', 'C73'], expected: 2 },
            { classes: ['commText', 'C82'], expected: 3 },
            { classes: ['commText', 'C88'], expected: 4 },
            { classes: ['commText', 'C9C'], expected: 5 },
            { classes: ['commText', 'CAE'], expected: 6 },
            { classes: ['commText', 'CBE'], expected: 7 },
            { classes: ['commText', 'CCE'], expected: 8 },
            { classes: ['commText', 'CDD'], expected: 9 },
            { classes: ['commText', 'cdD'], expected: 9 },
        ];

        testCases.forEach(({ classes, expected }) => {
            const mockDiv = createMockDiv(classes);
            const downvoteCount = getDownvoteCount(mockDiv);
            expect(downvoteCount).toBe(expected);
        });
    });

    it('should return undefined when no valid downvote class is present', () => {
        const testCases = [
            { classes: ['other-class'], expected: 0 },
            { classes: [], expected: 0 },
            { classes: ['cx5', 'abc'], expected: 0 }
        ];

        testCases.forEach(({ classes, expected }) => {
            const mockDiv = createMockDiv(classes);
            const downvoteCount = getDownvoteCount(mockDiv);
            expect(downvoteCount).toBe(expected);
        });
    });

    it('should handle multiple classes and pick the correct downvote class', () => {
        const mockDiv = createMockDiv(['header', 'c82', 'footer']);
        const downvoteCount = getDownvoteCount(mockDiv);
        expect(downvoteCount).toBe(3);
    });

    it('should return 0 for invalid downvote class format that matches pattern', () => {
        const testCases = [
            { classes: ['cxx'], expected: 0 },
            { classes: ['cfg'], expected: 0 }
        ];

        testCases.forEach(({ classes, expected }) => {
            const mockDiv = createMockDiv(classes);
            const downvoteCount = getDownvoteCount(mockDiv);
            expect(downvoteCount).toBe(expected);
        });
    });
});