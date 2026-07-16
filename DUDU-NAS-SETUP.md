# DuDu-NAS 部署清单

本方案不需要把 NAS 暴露到公网。游客数据先进入 Google Sheet，Apps Script 同步生成 CSV 到 Google Drive，群晖 Cloud Sync 将 CSV 拉回 DuDu-NAS，NAS 容器自动导入 SQLite 并显示后台。低分邮件由 Apps Script 即时发送。

## 1）更新 Google Apps Script

1. 打开当前评价表对应的 Google Sheet。
2. 点击“扩展程序 > Apps Script”。
3. 用仓库 `google-apps-script/Code.gs` 全部替换现有代码。
4. 在 `SETTINGS` 中填写：
   - `DRIVE_FOLDER_ID`：Google Drive 中专用文件夹的网址最后一段 ID。
   - `ALERT_EMAILS`：接收低分预警的邮箱，多个邮箱用英文逗号分隔。
5. 点击“部署 > 管理部署 > 编辑 > 新版本 > 部署”。继续使用原 Web App 地址，GitHub 页面无需改接口。
6. 手工提交一条测试评价，确认 Sheet 新增一行、低分行显示淡红色、Drive 文件夹出现 `nimbus_feedback_latest.csv`。

## 2）在 DuDu-NAS 建目录

在 File Station 创建：

```text
/volume1/docker/nimbus-feedback/app
/volume1/docker/nimbus-feedback/inbox
/volume1/docker/nimbus-feedback/data
```

把仓库 `nas/` 目录中的四个文件上传到：

```text
/volume1/docker/nimbus-feedback/app
```

## 3）配置 Cloud Sync

1. 打开群晖“Cloud Sync”。
2. 新建 Google Drive 同步任务。
3. 远程路径选择第 1 步的专用文件夹。
4. 本地路径选择 `/volume1/docker/nimbus-feedback/inbox`。
5. 同步方向选择“仅下载远程更改”。
6. 文件过滤保持允许 CSV。

完成后，在 File Station 确认存在：

```text
/volume1/docker/nimbus-feedback/inbox/nimbus_feedback_latest.csv
```

## 4）启动 NAS 后台

1. 打开“Container Manager > 项目 > 新增”。
2. 项目名称填 `nimbus-feedback`。
3. 路径选择 `/volume1/docker/nimbus-feedback/app`。
4. 选择已有的 `docker-compose.yml`。
5. 在启动前，把 `ADMIN_PASSWORD` 改为长密码。
6. 构建并启动项目。

健康检查：

```text
http://dudu-nas:18080/health
```

局域网后台：

```text
http://dudu-nas:18080/
```

Tailscale 后台：

```text
http://100.74.202.8:18080/
```

浏览器会要求输入 `ADMIN_USER` 和 `ADMIN_PASSWORD`。

## 5）最终验收

1. 用手机打开 `https://nimbustravelint1.github.io/Feedback/`。
2. 分别点击中文、英文、俄语、西班牙语，确认语言选择后才显示表单。
3. 提交一条正常评价，确认 Sheet、Drive CSV、NAS 后台三处均出现。
4. 再提交一条总体 3 星或单项 2 星评价，确认预警邮箱收到邮件，Sheet 行变红，NAS 后台显示红色记录。
5. 在 NAS 后台点击 `Export CSV`，确认可下载完整数据。

## 判定规则

- 总体满意度小于或等于 3 星：触发预警。
- 酒店、餐厅、导游任一单项小于或等于 2 星：触发预警。
- 阈值可在 `Code.gs` 的 `SETTINGS` 中修改。
