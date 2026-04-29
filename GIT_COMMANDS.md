# Git 命令速查手册

> 适用于微信小程序开发的常用 Git 命令

---

## 1. 提交代码（Commit）

```bash
# 查看修改了哪些文件
git status

# 添加所有修改到暂存区
git add .

# 或只添加特定文件
git add pages/index/index.js

# 提交并写提交信息
git commit -m "feat: 使用 TDesign组件"

# 提交时显示改动统计
git commit -stat -m "fix: 修复上传bug"

# 查看提交历史
git log --oneline -5
```

---

## 2. 推送到远程（Push）

```bash
# 推送到远程仓库
git push origin main

# 第一次推送，建立追踪关系
git push -u origin main

# 查看远程仓库地址
git remote -v

# 修改远程仓库地址
git remote set-url origin https://github.com/用户名/仓库名.git
```

---

## 3. 拉取代码（Pull）

```bash
# 拉取并合并远程代码
git pull origin main

# 只拉取不合并
git fetch origin

# 查看远程所有分支
git branch -r
```

---

## 4. 分支操作

```bash
# 查看本地分支（* 表示当前分支）
git branch

# 查看所有分支（包括远程）
git branch -a

# 创建新分支
git branch feature/new-page

# 切换到指定分支
git checkout feature/new-page

# 创建并切换（简写）
git checkout -b feature/new-page

# 删除分支（需要先切换走）
git branch -d feature/old-page

# 强制删除未合并的分支
git branch -D feature/old-page

# 合并分支到当前分支
git merge feature/new-page
```

---

## 5. 回滚代码（Rollback）

```bash
# 查看提交历史
git log --oneline

# 方式1：软回滚 - 保留修改，放到暂存区
git reset --soft HEAD~1

# 方式2：混合回滚 - 保留修改，放到工作区（默认）
git reset --mixed HEAD~1
git reset HEAD~1

# 方式3：硬回滚 - 彻底丢弃修改（⚠️ 慎用！）
git reset --hard HEAD~1

# 回滚到指定 commit
git reset --hard abc1234

# 查看所有操作记录（找回误删的 commit）
git reflog

# 撤销某个文件的修改
git checkout -- pages/index/index.js

# 取消暂存（undo add）
git reset HEAD pages/index/index.js
```

---

## 6. 查看与比较

```bash
# 查看工作区的修改
git diff

# 查看暂存区的修改
git diff --cached

# 查看某次提交的改动
git show abc1234

# 查看某个文件的修改历史
git log -p pages/index/index.js

# 查看简短的日志统计
git shortlog
```

---

## 7. 微信小程序 .gitignore 建议

```gitignore
# 依赖
node_modules/
miniprogram_npm/

# 微信开发者工具
project.private.config.json

# macOS
.DS_Store
.AppleDouble
.LSOverride

# IDE
.vscode/
.idea/

# 日志
*.log

# 压缩包
*.zip
*.tar
```

---

## 8. 常见工作流

### 日常开发流程
```bash
git checkout -b feature/new-feature    # 创建功能分支
git add .                               # 暂存修改
git commit -m "feat: 新功能"            # 提交
git push origin feature/new-feature     # 推送到远程

# 在 GitHub 上创建 Pull Request
```

### 修复 Bug 流程
```bash
git checkout -b fix/bug-description     # 创建修复分支
# 修改代码...
git add . && git commit -m "fix: 修复xxx问题"
git push origin fix/bug-description
```

### 合并分支到主分支
```bash
git checkout main                        # 切到主分支
git pull origin main                     # 拉取最新代码
git merge feature/feature-name          # 合并功能分支
git push origin main                    # 推送
```

---

## 9. 常见问题处理

### 合并冲突
```bash
# 拉取时被拒绝（远程有更新）
git pull origin main
# 手动解决冲突后
git add .
git commit -m "merge: 解决冲突"
git push origin main
```

### 推送被拒绝
```bash
# 远程分支有新的 commit，需要先拉取合并
git pull origin main
# 或者使用 rebase（推荐用于个人分支）
git pull --rebase origin main
```

### 误删分支恢复
```bash
# 通过 reflog 找到删除前的 commit
git reflog
# 创建新分支指向那个 commit
git checkout -b recovered-branch abc1234
```

---

## 10. 快捷别名（可选配置）

```bash
# ~/.gitconfig 中添加别名
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.unstage 'reset HEAD --'
```

之后可以使用简化命令：
```bash
git st      # 等于 git status
git co      # 等于 git checkout
git ci      # 等于 git commit
```

---

> 💡 **提示**：在微信开发者工具的"终端"面板中可以直接运行这些命令，无需切换到其他终端。
