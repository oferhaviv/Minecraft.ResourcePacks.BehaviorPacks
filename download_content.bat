rem ### Download Resource Pack Content from github ###
@echo off
echo Warniing, you are about to copy content from GitHub to Game folder
pause



set minecraft_BP_folder="C:\Users\oferh\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs\HarvestGuard"
set GH_folder="d:\github\Minecraft.ResourcePacks.BehaviorPacks\HarvestGuard"

set msg="Upload on %timestamp%"

cd /d %GH_folder%


echo Copy %GH_folder% %minecraft_BP_folder%
rem copy source from minecraft folder to GH folder 
xcopy %GH_folder% %minecraft_BP_folder%  /e /y /d /z

set minecraft_BP_folder="C:\Users\oferh\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs\ZipIt"
set GH_folder="d:\github\Minecraft.ResourcePacks.BehaviorPacks\ZipIt"
cd /d %GH_folder%


echo Copy %GH_folder% %minecraft_BP_folder%
rem copy source from minecraft folder to GH folder 
xcopy %GH_folder% %minecraft_BP_folder%  /e /y /d /z


pause
