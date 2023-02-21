var config = require('./config.js');
var utils = require('./utils.js');
var CryptoJS = require("crypto-js");

// 加密 
function btoa(str) { return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(str)); };

// 解密 
function atob(str) { return CryptoJS.enc.Base64.parse(str).toString(CryptoJS.enc.Utf8); };


function supportLanguages() {
  return config.supportedLanguages.map(([standardLang]) => standardLang);
}

async function login(loginUrl, loginJson, loginHeaders, translateJson) {
  try {
    return await $http.request({
      method: "POST",
      url: loginUrl,
      header: loginHeaders,
      body: loginJson
    });
  }
  catch (e) {
    $log.error('接口请求错误 ==> ' + JSON.stringify(e))
    Object.assign(e, {
      _type: 'network',
      _message: '接口请求错误 - ' + JSON.stringify(e),
    });
    throw e;
  }
}

function translate(query, completion) {
  (async () => {
    const targetLanguage = utils.langMap.get(query.detectTo);
    const sourceLanguage = utils.langMap.get(query.detectFrom);
    if (!targetLanguage) {
      const err = new Error();
      Object.assign(err, {
        _type: 'unsupportLanguage',
        _message: '不支持该语种',
      });
      throw err;
    }
    const source_lang = sourceLanguage || 'ja';
    const target_lang = targetLanguage || 'zh-CN';
    const translate_text = query.text || '';
    if (translate_text !== '') {

      // 获取登录令牌
      const loginUrl = 'https://api.mojidict.com/parse/functions/login'
      const url = 'https://api.mojidict.com/parse/functions/multiTrans_v2'
      const loginHeaders = {
        'Content-Type': 'application/json',
        // 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
      }
      const translateHeaders = {
        'Content-Type': 'application/json',
        // 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
      }
      let loginJson = {}
      if ($option.email) {
        // 填写了email则以email为登录账号,否则以手机号为登录账号
        loginJson = {
          "email": $option.email,
          "passwd": $option.passwd,
          "_ClientVersion": "js3.4.1",
          "_ApplicationId": "E62VyFVLMiW7kvbtVq3p",
          "g_os": "PCWeb",
          "g_ver": "v4.4.4.20230209",
          "_InstallationId": "6ea34159-6061-4aef-ae20-5e55da9f752a"
        }
      } else {
        // 填写了email则以email为登录账号,否则以手机号为登录账号
        loginJson = {
          "mobile": $option.mobile,
          "countryCode": $option.countryCode || 86,
          "passwd": $option.passwd,
          "_ClientVersion": "js3.4.1",
          "_ApplicationId": "E62VyFVLMiW7kvbtVq3p",
          "g_os": "PCWeb",
          "g_ver": "v4.4.4.20230209",
          "_InstallationId": "ba67ad7b-a78b-4b1b-bae0-36fa5683f6db"
        }
      }

      const translateJson = {
        "code": 0,
        "text": translate_text,
        "flang": source_lang,
        "tlang": target_lang,
        "_SessionToken": "",
        "_ClientVersion": "js3.4.1",
        "_ApplicationId": "E62VyFVLMiW7kvbtVq3p",
        "g_os": "PCWeb",
        "g_ver": "v4.4.4.20230209",
        "_InstallationId": "e0c9d4cc-814f-4b32-b07f-9af646fa756e"
      }

      let token = ''
      if ($file.exists('$sandbox/moji_token_cache.txt') && $file.read('$sandbox/moji_token_cache.txt').toUTF8()) {
        token = $file.read('$sandbox/moji_token_cache.txt').toUTF8();
        $log.error('*********** $sandbox/moji_token_cache.txt 读取成功??==>' + token)

        translateJson._SessionToken = token
      }
      try {
        if (!token) {
          const loginResponse = await login(loginUrl, loginJson, loginHeaders, translateJson);
          if (loginResponse.data && loginResponse.data.result && loginResponse.data.result.result && loginResponse.data.result.result.token) {
            translateJson._SessionToken = loginResponse.data.result.result.token
            var success = $file.write({
              data: $data.fromUTF8(translateJson._SessionToken),
              path: "$sandbox/moji_token_cache.txt"
            });
          } else {
            const errMsg = loginResponse.data ? JSON.stringify(loginResponse.data) : '未知错误'
            completion({
              error: {
                type: 'unknown',
                message: errMsg,
                addtion: errMsg,
              },
            });
          }
          token = translateJson._SessionToken
        }

        $http.request({
          method: "POST",
          url: url,
          header: translateHeaders,
          body: translateJson,
          handler: function (resp2) {
            if (resp2.data && resp2.data.result && resp2.data.result.trans_dst) {
              completion({
                result: {
                  from: query.detectFrom,
                  to: query.detectTo,
                  toParagraphs: resp2.data.result.trans_dst.split('\n'),
                },
              });
            } else {
              const errMsg = resp2.data ? JSON.stringify(resp2.data) : '未知错误'
              if (resp2.data && resp2.data.code == 209) {
                // token 过期 重新获取一次
                let success = $file.delete("$sandbox/moji_token_cache.txt");
                $log.error('token过期 ==> ' + JSON.stringify(resp2.data))
                completion({
                  error: {
                    type: 'unknown',
                    message: errMsg,
                    addtion: errMsg,
                  },
                });
              } else {
                $log.error('接口请求错误 resp2.data ==> ' + JSON.stringify(resp2.data))
                completion({
                  error: {
                    type: 'unknown',
                    message: errMsg,
                    addtion: errMsg,
                  },
                });
              }

            }
          }
        });
      }
      catch (e) {
        $log.error('接口请求错误 ==> ' + JSON.stringify(e))
        Object.assign(e, {
          _type: 'network',
          _message: '接口请求错误 - ' + JSON.stringify(e),
        });
        throw e;
      }
    }
  })().catch((err) => {
    $log.error('***********解析返回值异常==>' + JSON.stringify(err))
    completion({
      error: {
        type: err._type || 'unknown',
        message: err._message || '未知错误',
        addtion: err._addtion,
      },
    });
  });
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;
