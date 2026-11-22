; Tauri 的文件关联图标固定指向 exe，这里在安装结尾改回随包分发的笔记图标
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\Mindrizzle Note\DefaultIcon" "" "$\"$INSTDIR\mdrf.ico$\",0"
  !insertmacro UPDATEFILEASSOC
!macroend
