#!/usr/bin/env python3
"""Check for brace imbalances in TypeScript/JSX file"""

import sys

def check_braces(filename, end_line=2804):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    brace_count = 0
    paren_count = 0
    bracket_count = 0
    in_string = False
    in_comment = False
    in_multiline_comment = False
    string_char = None
    
    problems = []
    
    for i, line in enumerate(lines[:end_line], 1):
        for j, char in enumerate(line):
            # Skip if in string
            if in_string:
                if char == string_char and (j == 0 or line[j-1] != '\\'):
                    in_string = False
                    string_char = None
                continue
            
            # Skip if in single-line comment
            if in_comment:
                continue
                
            # Check for multiline comment
            if in_multiline_comment:
                if char == '*' and j + 1 < len(line) and line[j+1] == '/':
                    in_multiline_comment = False
                continue
            
            # Start of string
            if char in ('"', "'", '`'):
                in_string = True
                string_char = char
                continue
            
            # Start of single-line comment
            if char == '/' and j + 1 < len(line) and line[j+1] == '/':
                in_comment = True
                continue
                
            # Start of multiline comment
            if char == '/' and j + 1 < len(line) and line[j+1] == '*':
                in_multiline_comment = True
                continue
            
            # Count braces
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count < 0:
                    problems.append(f"Line {i}: Unexpected closing brace")
            elif char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
                if paren_count < 0:
                    problems.append(f"Line {i}: Unexpected closing paren")
            elif char == '[':
                bracket_count += 1
            elif char == ']':
                bracket_count -= 1
                if bracket_count < 0:
                    problems.append(f"Line {i}: Unexpected closing bracket")
        
        in_comment = False  # Reset at end of line
    
    print(f"Checking up to line {end_line}...")
    print(f"Brace balance: {brace_count} (should be > 0 for incomplete function)")
    print(f"Paren balance: {paren_count}")
    print(f"Bracket balance: {bracket_count}")
    print()
    
    if problems:
        print("Problems found:")
        for p in problems:
            print(f"  {p}")
    else:
        print("No structural problems found up to line 2804")
    
    if brace_count != 0:
        print(f"\n⚠️  Brace imbalance detected: {brace_count}")
        print("Expected: Component function should be open (positive count)")
    
    return brace_count, paren_count, bracket_count

if __name__ == '__main__':
    check_braces('/home/guda/GoCBC/ui/src/components/portals/BanksPortal.tsx')
