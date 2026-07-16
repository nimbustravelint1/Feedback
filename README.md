# Nimbus Travel 游客评价反馈系统

正式版包含：

1）一个永久二维码入口。
2）首页只显示公司 Logo、“欢迎来到中国”和四个大语言按钮。
3）选择中文、英文、俄语或西班牙语后进入对应表单。
4）保留原西班牙语模板全部字段。
5）Google Sheet 主数据、Google Drive CSV 归档、DuDu-NAS SQLite 后台。
6）低分邮件预警、低分标红、CSV 导出。

## 正式地址

```text
https://nimbustravelint1.github.io/Feedback/
```

## 文件说明

- `index.html`：游客端单页系统，已连接当前 Google Apps Script 地址。
- `google-apps-script/Code.gs`：Google Sheet 收集、Drive CSV、低分邮件预警。
- `nas/`：DuDu-NAS Docker 后台，自动导入 Cloud Sync 同步的 CSV。
- `DUDU-NAS-SETUP.md`：按顺序操作的部署清单。

敏感信息不要提交到公开仓库。邮箱、Drive Folder ID、后台密码只在 Google Apps Script 或 NAS 本地填写。
