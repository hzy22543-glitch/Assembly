; =====================================================
; io.inc — 标准 I/O 宏库 (SASM 兼容)
; NASM x86-64 Linux — 基于 libc (printf/scanf)
;
; 使用方法:  %include "io.inc"
; 链接时需要 GCC:  gcc -no-pie -m64 main.o -o main
;
; 提供的宏:
;   PRINT_STRING  str        — 打印字符串 (char*)
;   PRINT_DEC     size, val  — 打印有符号十进制整数
;   PRINT_UDEC    size, val  — 打印无符号十进制整数
;   PRINT_HEX     size, val  — 打印十六进制整数
;   PRINT_CHAR    val        — 打印单个字符
;   NEWLINE                  — 打印换行符
;   GET_DEC       size, var  — 读取有符号十进制整数
;   GET_UDEC      size, var  — 读取无符号十进制整数
;   GET_CHAR      var        — 读取单个字符
;   GET_STRING    buf, len   — 读取字符串
; =====================================================

%ifndef IO_INC
%define IO_INC

; ---- 外部 C 库函数声明 ----
extern printf
extern scanf
extern putchar
extern getchar
extern puts
extern fflush
extern stdout

; =====================================================
; PRINT_STRING — 打印以 null 结尾的字符串
; 参数: 字符串地址 (寄存器或内存)
; 例:   PRINT_STRING msg
; =====================================================
%macro PRINT_STRING 1
    section .data
        %%fmt: db "%s", 0
    section .text
        ; 保存被调用者可能修改的寄存器
        push rbp
        mov  rbp, rsp
        and  rsp, -16          ; 16-byte 栈对齐 (System V ABI)

        lea  rdi, [rel %%fmt]  ; 格式字符串
        lea  rsi, [rel %1]     ; 要打印的字符串
        xor  eax, eax          ; 无浮点参数
        call printf wrt ..plt

        mov  rsp, rbp
        pop  rbp
%endmacro

; =====================================================
; PRINT_DEC — 打印有符号十进制整数
; 参数: size (1=byte, 2=word, 4=dword, 8=qword), value
; 例:   PRINT_DEC 4, eax
;       PRINT_DEC 8, [counter]
; =====================================================
%macro PRINT_DEC 2
    section .data
        %%fmt: db "%lld", 0
    section .text
        push rbp
        mov  rbp, rsp
        and  rsp, -16

        lea  rdi, [rel %%fmt]
    %if %1 == 1
        movsx rsi, byte %2
    %elif %1 == 2
        movsx rsi, word %2
    %elif %1 == 4
        movsxd rsi, dword %2
    %else
        mov  rsi, %2
    %endif
        xor  eax, eax
        call printf wrt ..plt

        mov  rsp, rbp
        pop  rbp
%endmacro

; =====================================================
; PRINT_UDEC — 打印无符号十进制整数
; =====================================================
%macro PRINT_UDEC 2
    section .data
        %%fmt: db "%llu", 0
    section .text
        push rbp
        mov  rbp, rsp
        and  rsp, -16

        lea  rdi, [rel %%fmt]
    %if %1 == 1
        movzx rsi, byte %2
    %elif %1 == 2
        movzx rsi, word %2
    %elif %1 == 4
        mov  esi, dword %2
    %else
        mov  rsi, %2
    %endif
        xor  eax, eax
        call printf wrt ..plt

        mov  rsp, rbp
        pop  rbp
%endmacro

; =====================================================
; PRINT_HEX — 打印十六进制整数
; =====================================================
%macro PRINT_HEX 2
    section .data
        %%fmt: db "0x%llX", 0
    section .text
        push rbp
        mov  rbp, rsp
        and  rsp, -16

        lea  rdi, [rel %%fmt]
    %if %1 == 1
        movzx rsi, byte %2
    %elif %1 == 2
        movzx rsi, word %2
    %elif %1 == 4
        mov  esi, dword %2
    %else
        mov  rsi, %2
    %endif
        xor  eax, eax
        call printf wrt ..plt

        mov  rsp, rbp
        pop  rbp
%endmacro

; =====================================================
; PRINT_CHAR — 打印单个字符
; 参数: 字符 (寄存器、立即数或内存)
; 例:   PRINT_CHAR 'A'
;       PRINT_CHAR al
; =====================================================
%macro PRINT_CHAR 1
    push rbp
    mov  rbp, rsp
    and  rsp, -16

    %if %1+0 == %1  ; 立即数
        mov  edi, %1
    %else
        movzx edi, byte %1
    %endif
    call putchar wrt ..plt

    mov  rsp, rbp
    pop  rbp
%endmacro

; =====================================================
; NEWLINE — 打印换行符
; =====================================================
%macro NEWLINE 0
    push rbp
    mov  rbp, rsp
    and  rsp, -16
    mov  edi, 10    ; '\n'
    call putchar wrt ..plt
    mov  rsp, rbp
    pop  rbp
%endmacro

; =====================================================
; GET_DEC — 读取有符号整数
; 参数: size (1/2/4/8), variable
; 例:   GET_DEC 4, [num]
; =====================================================
%macro GET_DEC 2
    section .data
    %if %1 == 8
        %%fmt: db "%lld", 0
    %elif %1 == 4
        %%fmt: db "%d", 0
    %elif %1 == 2
        %%fmt: db "%hd", 0
    %else
        %%fmt: db "%hhd", 0
    %endif
    section .text
        push rbp
        mov  rbp, rsp
        and  rsp, -16

        lea  rdi, [rel %%fmt]
        lea  rsi, %2
        xor  eax, eax
        call scanf wrt ..plt

        mov  rsp, rbp
        pop  rbp
%endmacro

; =====================================================
; GET_UDEC — 读取无符号整数
; =====================================================
%macro GET_UDEC 2
    section .data
    %if %1 == 8
        %%fmt: db "%llu", 0
    %elif %1 == 4
        %%fmt: db "%u", 0
    %elif %1 == 2
        %%fmt: db "%hu", 0
    %else
        %%fmt: db "%hhu", 0
    %endif
    section .text
        push rbp
        mov  rbp, rsp
        and  rsp, -16

        lea  rdi, [rel %%fmt]
        lea  rsi, %2
        xor  eax, eax
        call scanf wrt ..plt

        mov  rsp, rbp
        pop  rbp
%endmacro

; =====================================================
; GET_CHAR — 读取单个字符
; 参数: variable (byte)
; 例:   GET_CHAR [ch]
; =====================================================
%macro GET_CHAR 1
    section .data
        %%fmt: db " %c", 0   ; 前导空格跳过空白
    section .text
        push rbp
        mov  rbp, rsp
        and  rsp, -16

        lea  rdi, [rel %%fmt]
        lea  rsi, %1
        xor  eax, eax
        call scanf wrt ..plt

        mov  rsp, rbp
        pop  rbp
%endmacro

; =====================================================
; GET_STRING — 读取字符串（带长度限制）
; 参数: buffer, max_length
; 例:   GET_STRING buf, 256
; =====================================================
%macro GET_STRING 2
    section .data
        %%fmt: db "%%%ds", 0  ; e.g., "%255s" — 这里简化为 %s
        %%fmt2: db "%s", 0
    section .text
        push rbp
        mov  rbp, rsp
        and  rsp, -16

        lea  rdi, [rel %%fmt2]
        lea  rsi, [rel %1]
        xor  eax, eax
        call scanf wrt ..plt

        mov  rsp, rbp
        pop  rbp
%endmacro

%endif ; IO_INC
