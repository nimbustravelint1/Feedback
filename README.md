# Nimbus Travel 游客评价反馈系统

四语游客满意度表单，支持中文、英文、俄语和西班牙语。

正式访问地址：

`https://nimbustravelint1.github.io/Feedback/`

## 当前数据流

游客提交后，数据发送至现有 Google Apps Script 接口，并进入原有 Google Sheet 数据表。

## 表单字段

1）团组编号
2）姓名
3）游览城市
4）行程线路
5）主要景点
6）酒店早餐
7）酒店设施
8）酒店服务
9）餐厅菜品质量
10）餐厅服务
11）导游服务态度
12）总体满意度
13）意见与建议

## 发布

`.github/workflows/pages.yml` 会在 main 分支更新后自动部署 GitHub Pages。

## 后续 NAS 归集

后续可增加 NAS 接收端，将 Google Sheet 定时导出的 CSV 通过群晖 Cloud Sync 同步到 NAS，或者改为 Cloudflare Worker 接收后转发至 NAS。
