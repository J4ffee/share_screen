# ShareScreen

小米手机取消了远程协助的功能，家里有老人，难免会有手机操作不明白的地方，于是开发了这个工具，代码全由AI完成，仅供测试

Android 屏幕实时共享工具。将 Android 设备屏幕通过 H.264 编码推送到中继服务器，浏览器观看并支持实时标注。


## 启动服务端

```bash
cd server
npm install
npm start
```

服务默认运行在 `http://localhost:8080`。

## Android 端

1. 用 Android Studio 打开 `android/ShareScreen/`，编译运行到手机
2. APP 中输入服务器地址（如 `http://192.168.1.100:8080`）
3. 点击**开始投屏**
4. 授予屏幕录制权限和悬浮窗权限
5. 界面显示**房间 ID**（6 位数字），记下来

## 浏览器观看

1. 用 Chrome 94+ 访问服务器地址（如 `http://localhost:8080`）
2. 输入 Android 端显示的房间 ID
3. 点击**连接**

> WebCodecs 要求安全上下文。如果通过 IP 地址访问（非 localhost），需要在 Chrome 地址栏输入 `chrome://flags/#unsafely-treat-insecure-origin-as-secure`，添加服务器地址并启用，然后重启浏览器。

## 实时标注

1. 连接成功后点击**标注**按钮
2. 在画面上用鼠标绘制标注
3. 标注会实时显示在 Android 设备屏幕上（红色笔迹，5 秒后自动消失）

## Docker 部署

```bash
cd server
docker build -t sharescreen-server .
docker run -p 8080:8080 sharescreen-server
```
