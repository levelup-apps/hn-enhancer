import {describe, expect, it} from '@jest/globals';

import { hello, structurePostComments } from './download.js';

describe('hello function', () => {
    it('should return "hello"', () => {
        expect(hello()).toBe("hello");
    });
});

describe('structurePostComments function', () => {
    it('should structure comments correctly', () => {
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

        const structuredComments = structurePostComments(post, commentsInDOM);

        // Test that the story (id = 101) does not exist
        expect(structuredComments.has(101)).toBe(false);

        expect(structuredComments.size).toBe(3);
        expect(structuredComments.not)

        expect(structuredComments.get(102)).toEqual({
            author: 'user1',
            replies: 1,
            position: 0,
            text: 'Comment 1',
            downvotes: 1,
            parentId: 101,
            path: '1',
            score: 900
        });

        expect(structuredComments.get(103)).toEqual({
            author: 'user2',
            replies: 0,
            position: 1,
            text: 'Comment 2',
            downvotes: 0,
            parentId: 102,
            path: '1.1',
            score: 666
        });

        expect(structuredComments.get(104)).toEqual({
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

describe('structurePostComments function', () => {
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

        const structuredComments = structurePostComments(post, commentsInDOM);

        expect(structuredComments.size).toBe(4);

        // Test that the story (id = 101) does not exist
        expect(structuredComments.has(201)).toBe(false);

        expect(structuredComments.get(202)).toEqual({
            author: 'user1',
            replies: 1,
            position: 0,
            text: 'Comment 1',
            downvotes: 1,
            parentId: 201,
            path: '1',
            score: 900
        });

        expect(structuredComments.get(203)).toEqual({
            author: 'user2',
            replies: 0,
            position: 1,
            text: 'Comment 2',
            downvotes: 10,
            parentId: 202,
            path: '1.1',
            score: 0
        });

        expect(structuredComments.get(204)).toEqual({
            author: 'user3',
            replies: 0,
            position: 2,
            text: 'Comment 3',
            downvotes: 0,
            parentId: 201,
            path: '2',
            score: 500
        });

        expect(structuredComments.get(205)).toEqual({
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