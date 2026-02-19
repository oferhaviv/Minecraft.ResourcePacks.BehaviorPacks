rem ### Upload Resource Pack Content to github ###

set hour=%time:~0,2%
if "%hour:~0,1%" == " " set hour=0%hour:~1,1%
echo hour=%hour%
set min=%time:~3,2%
if "%min:~0,1%" == " " set min=0%min:~1,1%
echo min=%min%
set secs=%time:~6,2%
if "%secs:~0,1%" == " " set secs=0%secs:~1,1%
echo secs=%secs%
set month=%date:~4,2%
if "%month:~1,1%" == "/" set month=0%month:~0,1%
echo month=%month%
set day=%date:~0,2%
if "%day:~0,1%" == " " set day=0%day:~1,1%
echo day=%day%
set year=%date:~-4%
echo year=%year%

set timestamp=%day%_%month%_%year%_%hour%%min%%secs%

set minecraft_BP_folder="C:\Users\oferh\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs\HarvestGuard"
set GH_folder="d:\github\Minecraft.ResourcePacks.BehaviorPacks\HarvestGuard"

set msg="Upload on %timestamp%"

cd /d %GH_folder%

git pull -all

rem copy source from minecraft folder to GH folder 
xcopy %minecraft_BP_folder% %GH_folder% /e /y

git add .

git commit -sa -m %msg%

git push

pause
